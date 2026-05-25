# Design briefing — supersede concurrent applies on one branch

> **Audience:** an OpenSpec session that will **propose and design** a follow-up
> change in the `foster-systems/specfly` repo. This briefing frames the problem and
> the option space; it does **not** prescribe the implementation — that is the
> design step's job. Read it fully, then run `/opsx:propose` (or `/opsx:new`).
>
> **Prereq reading (in this repo):** `openspec/_planning/HIGH-LEVEL-DESIGN.md`
> (architecture B2); `briefing-build.md` §11–13 (the backend trigger/result/dispatch
> contract); **`briefing-wire.md` §2(A)** (the `head_sha` hardening — it interacts
> with this change); the now-archived
> `openspec/changes/archive/2026-05-24-harden-backend-privacy/` (the run-state model
> this builds on).
>
> **Status:** discovered during `/opsx:verify` of `harden-backend-privacy`. It is a
> **pre-existing** behavior, NOT introduced by the privacy hardening — that change
> preserved the prior semantics faithfully. Scope it as its own change.

---

## 1. The problem

Two `@spec:apply` commits pushed to the same `change/<name>` branch in quick
succession (before the first apply finishes) produce **N parallel apply jobs that
race to push to one branch**, with nothing superseding the earlier, now-stale run.

This is half by-design and half a gap:

- **By design:** a new trigger sha re-dispatches. The spec
  `apply-dispatch` → *"Re-apply with a new sha re-dispatches"* explicitly requires a
  new `@spec:apply` commit (new sha → new `trigger_key`) to create a new run and
  fire a fresh dispatch. So the backend correctly fires a second `repository_dispatch`.
- **The gap:** nothing **cancels or supersedes** the first, in-flight apply. The
  intended "latest apply wins" semantics are not enforced anywhere — not in the
  workflow (no `concurrency` guard) and not in the backend.

### Two distinct issues to address (or consciously defer)

**(A) No workflow concurrency guard — primary.**
`apply.yml` and `examples/adopter-workflow.yml` declare no `concurrency:`. Each
`repository_dispatch` spawns an independent job, so N rapid triggers → N parallel
jobs, all checking out the same branch and all running
`git push origin HEAD:refs/heads/change/<name>` (non-forced — `apply.yml:173`). The
losers' pushes are rejected non-fast-forward and their jobs fail at the push step
(no `continue-on-error` there), so their result webhooks never arrive. Which apply's
output "wins" is a timing race — and the **newer** trigger can be the loser, which is
backwards from "latest wins."

**(B) Result-path TOCTOU — secondary.**
The backend reads `findDispatchedRunByRepoBranchKey` at the top of the push handler
(`backend/src/handlers/push.ts:41`) and only writes `markRunPrOpened` at the very end
(`push.ts:106`), with no transaction spanning read→act→update. Two near-simultaneous
**result** pushes for one branch could both observe a dispatched run and both act.
Duplicate-PR is still caught by `findOpenPr`, but the `pushEmptyCommit` path could
double-fire. Low probability and largely masked by issue (A)'s push race, but it is a
genuine race, not a guaranteed-safe path.

---

## 2. How the control plane behaves today (verified, file:line)

The mechanism, so the design starts from facts not guesses:

1. **Trigger classification ignores the DB.** `classifyPush`
   (`backend/src/logic.ts:60`) returns `"trigger"` purely on *change-branch + human
   sender + `@spec:apply` marker*. It never consults existing runs.
2. **The only trigger dedup is per-sha.** The handler's idempotency guard is
   `findRunByTriggerKey` (`push.ts:66`); `trigger_key = HMAC(repo, sha)`. It suppresses
   **redeliveries of the same commit** only — two different shas are two different
   keys → both dispatch.
3. **The first result claims the whole branch.** `markRunPrOpened`
   (`backend/src/db.ts:46`) is `UPDATE … WHERE repo_branch_key=? AND status='dispatched'`
   with **no `LIMIT`**, so it flips *every* dispatched row for the branch to
   `pr_opened` in one statement.

**Net effect — branch-level coalescing on the result side:** fire N rapid triggers on
one branch, and the *first* returning result performs the single PR/CI action and
claims all outstanding dispatched runs; later results find no dispatched run →
classify `ignore`. So you get exactly one PR / one CI-refresh regardless of N — but N
apply *jobs* still ran and raced. The coalescing is correct at the PR layer; the waste
and the "wrong apply wins" race are at the **job** layer.

Worked traces (validated against the code during verify):
- **Two triggers, no PR yet:** both shas dispatch → two `dispatched` rows share one
  `repo_branch_key`; two parallel jobs. First result → opens **one** PR, flips both
  rows to `pr_opened`. Second result → no dispatched run → `ignore`. Net: one PR.
- **PR open, two triggers before first apply finishes:** both re-dispatch → two new
  `dispatched` rows; two parallel jobs. First result → **one** `pushEmptyCommit`,
  flips both rows. Second result → `ignore`. Net: one CI-refresh commit.

---

## 3. Option space for the design (decide next session — do NOT pre-commit here)

**Axis 1 — where the guard lives:**
- **Reusable `apply.yml` (top-level `concurrency`)** — every adopter gets it
  automatically just by referencing `@v1`; no adopter action. Caveat: confirm GitHub
  honors `concurrency` defined in a reusable workflow and that the group expression
  evaluates in the **caller's** repo/event context (`github.event.client_payload.*`
  is available on the dispatch). This is the strongest candidate **because adopters
  COPY the caller** (`examples/adopter-workflow.yml`) — a caller-only guard would miss
  everyone who already copied it.
- **Caller `examples/adopter-workflow.yml` (top-level `concurrency`)** — simplest and
  unambiguous (one workflow run per `repository_dispatch`), but only protects adopters
  who (re)copy the updated example.
- **Possibly both**, with the reusable workflow as the authoritative guard and the
  example documenting it.

**Axis 2 — cancel vs queue:**
- `cancel-in-progress: true` → **latest wins** (matches the re-dispatch intent; the
  superseded apply is cancelled before it can push). Recommended default to evaluate.
- `cancel-in-progress: false` → serialize; every apply runs to completion in order.
  More compute, and the "stale apply still pushes" race persists in slow motion.

**Axis 3 — group key:** scope per branch/change, e.g.
`group: specfly-apply-${{ github.event.client_payload.change }}` (the dispatch payload
carries both `change` and `branch` — see `DispatchPayload` in `backend/src/types.ts`).
Confirm the exact field available in the context where the guard is declared.

**Axis 4 — does the backend need to change at all?**
- Leading hypothesis: **(A) is a pure workflow fix; the backend is already correct**
  (re-dispatch is intended; result-side coalescing already collapses to one PR).
- **(B) the result-path TOCTOU** is a separate, optional backend hardening: make the
  claim atomic — e.g. have `markRunPrOpened` report rows-affected and gate the
  PR-open / empty-commit action on having actually claimed a run, so a losing
  concurrent result no-ops. Decide whether to bundle this or split it into its own
  change. Do **not** "fix" it by making the backend refuse to re-dispatch while a
  dispatched run exists — that directly contradicts the
  *"Re-apply with a new sha re-dispatches"* requirement.

---

## 4. Interaction with the `head_sha` hardening (briefing-wire.md §2(A))

`briefing-wire.md` flags an optional hardening: wire `client_payload.head_sha` through
the caller and have the runner check out that exact SHA. That and this change are
complementary and worth deciding together:
- With `cancel-in-progress`, the superseded apply is cancelled before it pushes, so
  the head_sha race it guards against is mostly moot for *concurrent* triggers.
- Without cancel (queue mode), checking out a pinned `head_sha` makes each serialized
  apply deterministic about which commit it applied.

Flag in design whether to pull the head_sha wiring into this change, leave it in the
apply.yml wiring task, or keep them independent.

---

## 5. Scope / guardrails for the eventual change

**In scope:** concurrency semantics for rapid same-branch triggers — the workflow
guard (issue A), and a decision on whether to also close the result-path race
(issue B).

**Out of scope (do NOT touch):**
- The privacy model just shipped in `harden-backend-privacy` (HMAC-keyed runs, TTL
  cron, no `installations`) — build on it, don't revisit it.
- Trigger/result/ignore classification logic (`src/logic.ts`) and the
  `@spec:apply` marker.
- The `client_payload` contract shape, GitHub permissions, and the deploy runbook.
- Prerequisite policy (DESIGN §11.3) and the package-manager hard-fail.

**Must-nots:**
- Don't make the backend refuse to re-dispatch on a new sha (breaks an accepted spec
  requirement).
- Don't make the runner's result-commit subject start with `@spec:apply` (loop).
- Don't replace `GITHUB_TOKEN` on the push.

---

## 6. Open questions to resolve in design

1. Reusable-workflow `concurrency` vs caller-only vs both? (Adopters copy the caller —
   this likely decides it.)
2. `cancel-in-progress` (latest wins) vs serialize?
3. Exact group key and the context field that's actually available where the guard is
   declared (verify `github.event.client_payload.change`/`.branch` resolves there).
4. Bundle the result-path TOCTOU hardening (issue B) or split it out?
5. Bundle or cross-reference the `head_sha` checkout hardening?

---

## 7. Acceptance criteria sketch (for the verifier of the eventual change)

1. Two `@spec:apply` commits pushed in quick succession to one `change/<name>`
   result in exactly one effective apply driving the PR/CI action; the superseded
   apply is cancelled (cancel mode) or cleanly runs without clobbering (queue mode) —
   per the chosen semantics.
2. No duplicate PR and no double CI-refresh commit under the rapid-trigger race
   (already true today via result-side coalescing — must remain true).
3. If the guard lands in the reusable workflow: adopters referencing `@v1` get it with
   no change to their copied caller. If caller-only: the example is updated and the
   README tells adopters to re-copy.
4. `actionlint` clean on `apply.yml` and `examples/adopter-workflow.yml`.
5. If issue (B) is included: a losing concurrent **result** webhook provably no-ops
   (gated on an atomic claim), with a test.
6. The re-dispatch-on-new-sha requirement still holds (no regression in
   `apply-dispatch`).

---

## 8. Note for the maintainer

`STATUS.md` is now stale relative to the archived `harden-backend-privacy` change — it
still describes the D1 schema as `installations`+`runs` and "27 tests," predating the
HMAC-keyed slim `runs`, the TTL cron, `STATE_HMAC_KEY`, and the 35-test suite. Worth a
refresh in the same session that picks up this change (not required for it).
