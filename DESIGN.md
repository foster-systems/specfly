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

It is **free and open**. The point isn't revenue; it's a clean, transparent,
genuinely-easy tool that builds reputation and goodwill in the community.

## 2. Goals & non-goals

**Goals**
- **Effortless adoption** — install an App, add one secret, commit one small
  workflow file. That's it.
- **Transparency** — adopters can read exactly what runs (a versioned, public
  reusable workflow) and exactly what permissions the App holds.
- **Tight blast radius** — the agent never holds a broad personal token; it can
  only push branches in one repo for the life of one job.
- **No infra for adopters** — compute runs in *their* GitHub Actions; they bring
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
  │  label "specfly:apply"   ────┼────────▶│  GitHub App webhook               │
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
  never *create* an App.
- Holds one App ID + private key, centrally (in the backend's secret store).
- Requested permissions on the adopter's repo: **Pull requests: write** (open the
  PR), **Contents: read**, **Metadata: read**. Subscribes to the events it needs
  (e.g. `pull_request.labeled`, branch `push`).
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
     repository_dispatch:          # fired BY the Specfly backend, never locally
       types: [specfly-apply]
   permissions:
     contents: write               # push the change branch; main ruleset fences off main
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
   server-side, regardless of how capable any token is. *This* is the control
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

Provide both a click-by-click UI walkthrough and a copy-paste `gh api` /
ruleset-JSON snippet so adopters can apply it in one command.

## 7. Usage flow (per change)

1. Local: `claude /opsx:propose`, push `change/<name>`.
2. The App opens a **draft PR as `Specfly[bot]`** (so you can approve later).
3. Add the label **`specfly:apply`** when ready → backend dispatches → runner
   applies + pushes commits → App marks the PR ready, logs linked from the run.
4. Review → approve → merge. WIP pushes stay free and silent; only the **label**
   fires a run.
5. Local: `claude /opsx:verify`, `claude /opsx:archive`, push.

## 8. Upgrades

Bump `@v1` → `@v2` in the one workflow file (or move a major tag / let Dependabot
bump it). No `install.sh`, no `upgrade`/`reconfigure`, no `.remcc/version` marker,
no template copying.

## 9. Cost model (maintainer side)

Backend cost scales with **webhook volume** (tiny per user), not with **compute**
(which adopters pay for). The curve is nearly flat:

| Scale | Approx backend cost/mo |
|---|---|
| 100 users | $0 (free tier) |
| 1,000 users | $0–5 |
| 10,000 users (heavy) | ~$5–15 compute + ~$20 DB |
| 100,000 users (heavy) | ~$50–150 total |

Only guaranteed fixed cost: the `specfly.io` domain (~$12/yr). The real cost at
scale is **maintainer time** (support, on-call) — not dollars.

## 10. Comparison to remcc (v1)

| | remcc (v1) | Specfly |
|---|---|---|
| GitHub App | adopter creates + installs their own | install the maintainer's App (3 clicks) |
| Secrets to set | App ID + private key + slug + Anthropic key | **just `ANTHROPIC_API_KEY`** |
| Adopter files | full workflow + templates copied in | **one ~10-line caller** |
| Install tooling | 38 KB `install.sh` + upgrade/reconfigure | **none** |
| Drift tracking | `.remcc/version` marker | none (pinned tag) |
| Upgrades | re-copy templates via PR | bump a tag |
| Branch protection | auto-configured by installer | **documented, adopter-owned** |
| Backend | none (all in adopter Actions) | tiny free Cloudflare control plane |
| Trigger | `@change-apply` commit subject | `specfly:apply` PR label (visible) |

## 11. Open questions to settle before building

1. **Does CI need to run on the generated PR?** This is the one decision that
   determines whether a backend is needed at all:
   - **Yes (recommended assumption)** → keep the hosted App + backend so the PR is
     authored by `Specfly[bot]`; PRs opened by an App **do** trigger the
     adopter's CI.
   - **No** → you could drop the backend entirely and have the runner open the PR
     with the built-in `GITHUB_TOKEN` as `github-actions[bot]` (still a separate
     actor you can approve) — but PRs/commits made with `GITHUB_TOKEN` **do not
     trigger** other workflows, so the adopter's CI/checks won't run automatically.
2. **First-run trigger UX.** Confirm the "App auto-opens a draft PR on first push
   of a `change/*` branch, label fires apply" flow vs. a dashboard button.
3. **Prerequisite reduction.** Keep OpenSpec + pnpm/bun as hard prereqs, or
   auto-init OpenSpec / broaden to npm/yarn for easier adoption?

## 12. Naming

Renamed from **remcc** → **Specfly**. "spec" ties to OpenSpec; "fly" = lightweight,
fast, hands-off ("push it and it takes off").

Availability-checked 2026-05-21:

| | npm | GitHub org | `.io` | `.ai` | `.com` |
|---|---|---|---|---|---|
| **Specfly** ✅ | free | free | free | free | taken |

Canonical identity: repo **`foster-systems/specfly`** (a public repo under the
existing **Foster Systems** org — no dedicated org needed), npm `specfly`, domain
`specfly.io`, App `github.com/apps/specfly` (App slugs are global, independent of
the owning org). `.com` is taken — acceptable, `.io` is conventional for dev
tools. The standalone `specfly` GitHub org was checked-available but is not used.

Known trade-off: soft brand adjacency to **Fly.io** (a dev-infra platform) — a
confusion *risk*, not a collision; no one holds the name in the spec-driven-dev
space.

Rejected alternatives: **SpecPilot** (an active, same-purpose npm CLI already owns
the name + GitHub org + domains) and **Specwright** (npm + GitHub + domains all
taken).
