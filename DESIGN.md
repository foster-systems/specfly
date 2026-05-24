# Specfly — Design

> Successor to **remcc** (Remote Claude Code). A free, hosted-but-tiny way to run
> Claude Code's `/opsx:apply` on a GitHub-hosted runner and get a reviewable PR
> back — with almost no setup for adopters.
>
> Status: design / exploration. Date: 2026-05-21.

## 1. Vision

Push an OpenSpec change, get a pull request — without tethering your laptop and
without standing up any infrastructure of your own. Specfly is the thin
orchestration layer that makes that "just work."

It is **free and opensource**.

## 2. Goals & non-goals

**Goals**

- **Effortless adoption** — install an App, add one secret, commit one small
  workflow file. That's it.
- **Transparency** — adopters can read exactly what runs (a versioned, public
  reusable workflow) and exactly what permissions the App holds.
- **Tight blast radius** — the agent never holds a broad personal token; it can
  only push branches in one repo for the life of one job.
- **No infra for adopters** — compute runs in _their_ GitHub Actions; they bring
  their own Anthropic key.
- **Near-zero cost for the maintainer** — the backend is a webhook router, not a
  compute host.

**Non-goals (deliberately not doing these)**

- ❌ **No billing / subscription.** Free to use. The maintainer's cost is small
  enough that gating it isn't worth the friction.
- ❌ **No token business / fronting Anthropic billing.** Bring-your-own key.
- ❌ **No customer code custody.** Source never leaves the adopter's runner.
- ❌ **No compute custody.** Specfly never runs Claude Code on its own servers.
- ❌ **No auto-configuring the adopter's repo settings** (e.g. branch protection).
  We provide **clear documentation** for that instead of requesting elevated
  permissions.

## 3. Architecture (the "B2" model)

A hosted **control plane** (a GitHub App + a tiny backend) that dispatches work
into the **adopter's own data plane** (their GitHub Actions runner).

```
  ┌─────────────────────────────┐         ┌──────────────────────────────────┐
  │  ADOPTER'S REPO (data plane) │         │  SPECFLY (control plane)          │
  │                              │         │                                   │
  │  push @specfly:apply     ────┼────────▶│  GitHub App webhook               │
  │                              │         │    → (free: no entitlement gate)  │
  │  runner runs apply.yml  ◀────┼─────────┤    → repository_dispatch          │
  │    - checkout                │         │                                   │
  │    - install pnpm/bun        │         │                                   │
  │    - run Claude /opsx:apply  │         │                                   │
  │    - push change/<name>  ────┼────────▶│  App opens/updates PR as          │
  │      (GITHUB_TOKEN)          │         │  Specfly[bot]  (separate actor)   │
  │                              │         │                                   │
  │  human reviews → approves ───┼─── you can approve (bot ≠ you) ─→ merge     │
  └─────────────────────────────┘         └──────────────────────────────────┘
```

The expensive work (clone + Claude Code + tokens) happens in the adopter's
Actions. The backend only routes events and authors the PR.

## 4. Components

### 4.1 Hosted GitHub App (`specfly`)

- Published once by the maintainer. Adopters **install** it (3 clicks); they
  never _create_ an App.
- Holds one App ID + private key, centrally (in the backend's secret store).
- Requested permissions on the adopter's repo: **Pull requests: write** +
  **Contents: read & write** + **Metadata: read**. Contents: write is mandatory,
  not optional — `POST …/dispatches` (repository_dispatch) and `POST …/pulls`
  (open the PR) both require it; the same permission also covers the CI-refresh
  empty commit pushed on re-runs (§7 step 4), so that adds no new scope. Subscribes
  to **branch `push`** (the trigger
  detector + result detector) and `pull_request` (lifecycle/history).
- Notably does **not** request `Administration: write` — branch protection is the
  adopter's job, documented (see §6.3).

### 4.2 Tiny backend (Cloudflare Workers)

- Stateless-ish webhook handler: verify signature → mint a short-lived
  installation token → `repository_dispatch` into the adopter's repo → open/update
  the PR when the branch is pushed.
- Recommended stack: **Cloudflare Workers + D1 (SQLite) + Workers Secrets**.
  Always-warm (no cold-start webhook misses), global, free tier covers a long
  runway. Backend host: `api.specfly.io`.
- Stores only metadata (installations, run history). **No source code, no logs of
  substance** — run logs stay in the adopter's Actions artifacts.

### 4.3 Versioned reusable workflow (`apply.yml`)

- Lives in the public `foster-systems/specfly` repo, pinned by tag (`@v1`). Contains the actual
  steps: checkout, resolve package manager, run Claude Code `/opsx:apply`, push
  the change branch.
- This is the "proper version" adopters pull in. Upgrades = bump the tag.

### 4.4 Adopter footprint (the whole thing)

- One Actions secret: `ANTHROPIC_API_KEY`.
- One ~10-line caller workflow (see §5).
- That's it.

## 5. Adopter setup

**Prerequisites**

- An OpenSpec-initialised repo with `.claude/` committed.
- A pnpm- or bun-managed JS repo (`packageManager` set, or bun lockfile).
- An Anthropic API key.

**One-time setup (a few clicks + two tiny commits)**

1. **Install the Specfly App** — on `github.com/apps/specfly`, pick the repo(s),
   approve permissions. No App creation, no App ID / private key / slug secrets.
2. **Add one secret** — `ANTHROPIC_API_KEY` in repo → Settings → Secrets.
3. **Add the workflow file** and commit it:

   ```yaml
   # .github/workflows/specfly.yml
   name: Specfly Apply
   on:
     repository_dispatch: # fired BY the Specfly backend, never locally
       types: [specfly-apply]
   permissions:
     contents: write # push the change branch; main ruleset fences off main
   jobs:
     apply:
       uses: foster-systems/specfly/.github/workflows/apply.yml@v1
       secrets:
         anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

4. **(Strongly recommended) Protect `main`** — documented, not automated. See §6.3.

## 6. Identity & security model

### 6.1 Three independent layers

1. **Runner token** — the workflow's built-in `GITHUB_TOKEN`, scoped to
   `contents: write`, single-repo, expires when the job ends. Used only to push
   the change branch. The agent never holds a personal or org-wide token.
2. **`main` ruleset** — blocks direct pushes and unapproved merges to `main`
   server-side, regardless of how capable any token is. _This_ is the control
   that prevents unreviewed changes from landing — not the token scope.
3. **PR author identity** — the Specfly App opens the PR as `Specfly[bot]`,
   a distinct actor from the human, so a solo maintainer can legitimately approve
   it (GitHub forbids approving your own PR).

### 6.2 Why token scope alone can't do it

GitHub tokens scope by **permission category** and **repo**, not by branch. Push
and merge both require `Contents: write` — you cannot grant "push to `change/*`"
while denying "merge to `main`" at the token level. Branch-level enforcement comes
from the ruleset.

### 6.3 Branch protection — documented, adopter-owned

We do **not** request `Administration: write` to configure this automatically.
Instead, the docs walk the adopter through a `main` ruleset:

- Require a pull request before merging.
- Require **1** approving review.
- Block direct pushes / force pushes / deletions on `main`.
- Do **not** add Specfly[bot] to the bypass list.

Both a click-by-click UI walkthrough and a copy-paste `gh api` / ruleset-JSON
snippet are written up in **[docs/protect-main.md](docs/protect-main.md)**.

## 7. Usage flow (per change)

1. Local: `claude /opsx:propose` to design and plan the change, push `change/<name>` branch. Ordinary WIP pushes are
   free and silent.
2. When ready, make a commit whose subject starts with **`@specfly:apply`** and
   push it. The backend (push webhook) matches the branch + prefix and dispatches.
3. The runner runs `/opsx:apply` and pushes the result commits to `change/<name>`
   (subject `opsx:apply <name>` — no prefix, so it can't re-trigger). The backend
   sees that result push and opens the PR as **`Specfly[bot]`** — a distinct actor,
   so you (the reviewer) can approve it and your CI triggers. No PR exists before apply completes.
4. Review the PR — findings may produce extra tasks to be applied. Re-run them
   with **`@specfly:apply`**: each run pushes more commits to `change/<name>` and
   the existing PR updates in place (no new PR is opened). Those result commits are
   pushed with the runner's `GITHUB_TOKEN`, which on its own would _not_ re-fire CI
   (GitHub's anti-recursion rule — see §11 Q1), so the backend refreshes CI by
   pushing one empty commit as **`Specfly[bot]`**; an App-authored push does trigger
   workflows. The backend does this only when a PR is already open (a re-run); for
   an adopter with no CI the empty commit is a harmless no-op (nothing to trigger),
   so no check on CI state is needed. This loop can continue until the reviewer
   (you) is happy.
5. Finally, you _archive_ the change with `claude /opsx:archive`, push that last commit, and then approve and merge the PR.

## 8. Upgrades

Bump `@v1` → `@v2` in the one workflow file (or move a major tag / let Dependabot
bump it). No `install.sh`, no `upgrade`/`reconfigure`, no `.remcc/version` marker,
no template copying.

## 9. Cost model (maintainer side)

Backend cost scales with **webhook volume** (tiny per user), not with **compute**
(which adopters pay for). The curve is nearly flat:

| Scale                 | Approx backend cost/mo   |
| --------------------- | ------------------------ |
| 100 users             | $0 (free tier)           |
| 1,000 users           | $0–5                     |
| 10,000 users (heavy)  | ~$5–15 compute + ~$20 DB |
| 100,000 users (heavy) | ~$50–150 total           |

Only guaranteed fixed cost: the `specfly.io` domain (~$12/yr). The real cost at
scale is **maintainer time** (support, on-call) — not dollars.

## 10. Comparison to remcc (v1)

|                   | remcc (v1)                                  | Specfly                                 |
| ----------------- | ------------------------------------------- | --------------------------------------- |
| GitHub App        | adopter creates + installs their own        | install the maintainer's App (3 clicks) |
| Secrets to set    | App ID + private key + slug + Anthropic key | **just `ANTHROPIC_API_KEY`**            |
| Adopter files     | full workflow + templates copied in         | **one ~10-line caller**                 |
| Install tooling   | 38 KB `install.sh` + upgrade/reconfigure    | **none**                                |
| Drift tracking    | `.remcc/version` marker                     | none (pinned tag)                       |
| Upgrades          | re-copy templates via PR                    | bump a tag                              |
| Branch protection | auto-configured by installer                | **documented, adopter-owned**           |
| Backend           | none (all in adopter Actions)               | tiny free Cloudflare control plane      |
| Trigger           | `@change-apply` commit subject              | `@specfly:apply` commit subject         |

## 11. Open questions to settle before building

1. **Does CI need to run on the generated PR?** ✅ **RESOLVED 2026-05-24: Yes —
   keep the hosted App + backend.** A PR/commit made with the runner's built-in
   `GITHUB_TOKEN` cannot trigger other workflows (GitHub's anti-recursion rule),
   so a runner-opened PR would leave the adopter's CI silent — and if their `main`
   ruleset makes CI a required status check, the PR could never be merged without
   manual intervention. A GitHub App installation token is exempt from that rule,
   so a `Specfly[bot]`-authored PR triggers CI like a human's. For a tool whose
   entire output is generated code, that safety net must fire automatically.
   The same rule bites on re-runs: when `@specfly:apply` runs again the runner
   pushes result commits to the already-open PR with `GITHUB_TOKEN`, so CI would
   stay silent. The backend handles this by pushing one empty commit as the App
   (an installation-token push, exempt from the rule) to re-fire CI — reusing the
   App's existing `Contents: write` (§4.1), no new permission. Re-requesting the
   check suite (`Checks: write`) was rejected: it needs a check suite to already
   exist on that SHA, which the suppressed `GITHUB_TOKEN` push never creates, so it
   would target nothing — a new permission bought for a mechanism that never fires.
   The empty-commit path needs no CI-state check either: the backend pushes it only
   when a PR is already open (a re-run), and for an adopter with no CI it is a
   harmless no-op. Suppressing even that no-op would itself need a read permission
   (`Checks: read`) the App deliberately doesn't hold — not worth it on an
   already-registered App, where every adopter would have to re-consent. The
   analysis below is kept for the record.
   - **Yes (chosen)** → keep the hosted App + backend so the PR is
     authored by `Specfly[bot]`; PRs opened by an App **do** trigger the
     adopter's CI.
   - **No** → you could drop the backend entirely and have the runner open the PR
     with the built-in `GITHUB_TOKEN` as `github-actions[bot]` (still a separate
     actor you can approve) — but PRs/commits made with `GITHUB_TOKEN` **do not
     trigger** other workflows, so the adopter's CI/checks won't run automatically.
2. **First-run trigger UX.** ✅ **RESOLVED 2026-05-24: commit-message-prefix
   trigger (remcc-style), no draft PR on first push.** You push a `change/<name>`
   branch; a commit whose subject starts with `@specfly:apply` fires the run. The
   backend detects it on the **push** webhook (branch + prefix match) and
   `repository_dispatch`es into the repo — so the adopter workflow stays
   `on: repository_dispatch`, unchanged. The runner applies and pushes the result
   (subject `opsx:apply <name>`, no prefix → can't re-trigger); the backend sees
   that result push (pusher `github-actions[bot]`, run pending in D1) and opens the
   PR as `Specfly[bot]` — exactly once. This avoids the draft-PR chicken-and-egg a
   label needs (you can't label a not-yet-existing PR), keeps the flow in the
   terminal, and preserves the separate-actor PR (App opens it → approvable + CI
   triggers). Trade-offs: the `@specfly:apply` prefix lives permanently in branch
   history; the trigger shows in `git log` rather than as a GitHub UI chip.
3. **Prerequisite reduction.** ✅ **RESOLVED 2026-05-24: keep OpenSpec + pnpm/bun
   as hard prereqs for now; broaden later if it doesn't force a redesign (it
   won't).** Neither prereq is architecturally load-bearing: OpenSpec is the
   substrate (`/opsx:apply` has nothing to act on without it), and pnpm/bun support
   lives entirely in `apply.yml`'s "Resolve package manager" + deps-install steps —
   the App + backend are agnostic to both. So future broadening is **additive and
   localized**, never a control-plane change: add `npm ci`/`yarn --immutable` cases
   to that one step (cheapest first win), or add an auto-init-OpenSpec onboarding
   path. To keep that door cheap, the prereq gates stay **explicit and early**
   (clear `::error::` messages) and **documented up front** (§5). No code change now.

## 12. Naming

Renamed from **remcc** → **Specfly**. "spec" ties to OpenSpec; "fly" = lightweight,
fast, hands-off ("push it and it takes off").

Availability-checked 2026-05-21:

|                | npm  | GitHub org | `.io` | `.ai` | `.com` |
| -------------- | ---- | ---------- | ----- | ----- | ------ |
| **Specfly** ✅ | free | free       | free  | free  | taken  |

Canonical identity: repo **`foster-systems/specfly`** (a public repo under the
existing **Foster Systems** org — no dedicated org needed), npm `specfly`, domain
`specfly.io`, App `github.com/apps/specfly` (App slugs are global, independent of
the owning org). `.com` is taken — acceptable, `.io` is conventional for dev
tools. The standalone `specfly` GitHub org was checked-available but is not used.
