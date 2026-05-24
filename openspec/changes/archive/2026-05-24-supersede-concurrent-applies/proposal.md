## Why

Two `@specfly:apply` commits pushed to the same `change/<name>` branch in quick
succession (before the first apply finishes) spawn **N parallel apply jobs that race
to push to one branch**, with nothing superseding the earlier, now-stale run. A new
trigger sha re-dispatching is by design (`apply-dispatch` → *"Re-apply with a new sha
re-dispatches"*), but the intended **"latest apply wins"** semantics are enforced
nowhere: neither `apply.yml` nor `examples/adopter-workflow.yml` declares a
`concurrency:` guard, so every `repository_dispatch` runs an independent job. All such
jobs check out the same branch and run a non-forced `git push` (`apply.yml:173`); the
losers are rejected non-fast-forward and fail at the push step — and the **newer**
trigger can be the loser, which is backwards from "latest wins." This is a pre-existing
behavior, not introduced by `harden-backend-privacy`; this change builds on that
HMAC-keyed run-state model without revisiting it.

## What Changes

- **Add a concurrency guard to the reusable runner workflow** `.github/workflows/apply.yml`
  — a job-level `concurrency` on the `apply` job, grouped per change
  (`group: specfly-apply-${{ inputs.change }}`) with `cancel-in-progress: true`. Rapid
  same-branch triggers now coalesce to **one effective apply, latest wins**: a newer
  `@specfly:apply` cancels the in-flight apply before it can push, so the stale job
  never clobbers the branch. The guard lives in the **reusable** workflow so every
  adopter referencing `@v1` gets it with no change to their copied caller; the caller
  example documents it.
- **Close the result-path TOCTOU in the backend (issue B).** Make the result-side
  claim atomic: `markRunPrOpened` reports rows-affected and the handler claims the
  branch's `dispatched` run **before** acting, gating the PR-open / CI-refresh on
  having actually claimed a row. A losing concurrent or redelivered `result` webhook
  then provably no-ops instead of double-firing an empty CI-refresh commit. This
  closes the read→act→update race between `findDispatchedRunByRepoBranchKey`
  (`push.ts:41`) and `markRunPrOpened` (`push.ts:106`).
- **Document the supersede semantics** in the workflow comments and `backend/README.md`,
  and cross-reference (do not bundle) the optional `head_sha` checkout hardening from
  `briefing-wire.md §2(A)` — cancel mode makes that race moot for concurrent triggers.

Non-goals: the trigger/result/ignore classification (`src/logic.ts`) and the
`@specfly:apply` marker are unchanged; the backend still re-dispatches on a new sha
(no `apply-dispatch` regression); the `client_payload` contract, GitHub permissions,
and the privacy model just shipped in `harden-backend-privacy` are untouched.

## Capabilities

### New Capabilities
- `apply-concurrency`: The reusable apply workflow's concurrency semantics — rapid
  same-branch `@specfly:apply` triggers resolve to exactly one effective apply (latest
  wins via `cancel-in-progress`), the guard is carried by the reusable workflow so
  adopters inherit it via `@v1`, and the result still classifies correctly.

### Modified Capabilities
- `pr-authoring`: the PR-open / CI-refresh action is gated on an **atomic claim** of
  the branch's `dispatched` run (the `dispatched → pr_opened` transition reports
  rows-affected); a `result` that claims no row no-ops, so a losing concurrent or
  redelivered result cannot double-open a PR or double-fire the CI-refresh commit.

## Impact

- **Workflow:** `.github/workflows/apply.yml` (add job-level `concurrency` on the
  `apply` job; comment); `examples/adopter-workflow.yml` (documenting comment only — no
  functional change, since the authoritative guard is in the reusable workflow).
- **Backend code:** `backend/src/db.ts` (`markRunPrOpened` returns rows-affected),
  `backend/src/handlers/push.ts` (claim-before-act: atomic claim gates the PR-open /
  empty-commit), and a test for the losing-result no-op.
- **Docs:** `backend/README.md` (supersede/latest-wins note; the atomic-claim guarantee).
- **Validation:** `actionlint` clean on `apply.yml` and `examples/adopter-workflow.yml`;
  `vitest` + `tsc --noEmit` green.
- **Out of scope (unchanged):** no deploy / secret / App re-registration; no new GitHub
  permission; `src/logic.ts` classification and the `client_payload` shape untouched;
  the `head_sha` checkout hardening is cross-referenced, not included.
