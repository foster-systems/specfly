# Specfly — Design

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
  │  push @spec:apply     ────┼────────▶│  GitHub App webhook               │
  │                              │         │    → (free: no entitlement gate)  │
  │  runner runs apply.yml  ◀────┼─────────┤    → repository_dispatch          │
  │    - checkout                │         │                                   │
  │    - setup Node + CLIs       │         │                                   │
  │    - agent provisions env    │         │                                   │
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
  runway. Backend host: `api.specfly.dev`.
- Stores only metadata (installations, run history). **No source code, no logs of
  substance** — run logs stay in the adopter's Actions artifacts.

### 4.3 Versioned reusable workflow (`apply.yml`)

- Lives in the public `foster-systems/specfly` repo, pinned by tag (`@v1`). Contains the actual
  steps: checkout, set up Node + Specfly's own CLIs (Claude Code + OpenSpec), run
  Claude Code `/opsx:apply` (the agent provisions the project's own environment in a
  sub-agent), push the change branch. It makes **no** assumption about the adopter's
  language or package manager.
- This is the "proper version" adopters pull in. Upgrades = bump the tag.

### 4.4 Adopter footprint (the whole thing)

- One Actions secret: `ANTHROPIC_API_KEY`.
- One ~10-line caller workflow (see §5).
- One command file: `.claude/commands/spec/apply.md` (the `/spec:apply` trigger).
- That's it.

## 5. Adopter setup

**Prerequisites**

- An OpenSpec-initialised repo with `.claude/` committed.
- An Anthropic API key.

Any language/toolchain works — Specfly makes no assumption about your package
manager. The agent provisions the project environment itself; document anything
non-obvious in `CLAUDE.md` / `AGENTS.md` (see the README's "Fine-tuning for your
stack").

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

1. Local: `claude /opsx:propose` to design and plan the change. The work lives on a
   `change/<name>` branch — `/spec:apply` (step 2) creates it on first run if you
   haven't already. Ordinary WIP pushes are free and silent.
2. When ready, run **`/spec:apply`** (it produces a commit whose subject starts with
   **`/spec:apply`** and pushes it). The backend (push webhook) matches the branch +
   prefix and dispatches.
3. The runner runs `/opsx:apply` and pushes the result commits to `change/<name>`
   (subject `opsx:apply <name>` — no prefix, so it can't re-trigger). The backend
   sees that result push and opens the PR as **`Specfly[bot]`** — a distinct actor,
   so you (the reviewer) can approve it and your CI triggers. No PR exists before apply completes.
4. Review the PR — findings may produce extra tasks to be applied. Re-run them
   with **`/spec:apply`**: each run pushes more commits to `change/<name>` and
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

Only guaranteed fixed cost: the `specfly.dev` domain (~$12/yr). The real cost at
scale is **maintainer time** (support, on-call) — not dollars.
