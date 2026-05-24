## Context

The control plane intentionally re-dispatches on every new trigger sha (`apply-dispatch`
→ *"Re-apply with a new sha re-dispatches"*): a second `@specfly:apply` commit mints a
new `trigger_key` and fires a fresh `repository_dispatch`. Nothing, however, supersedes
the **earlier, in-flight** apply. `.github/workflows/apply.yml` and
`examples/adopter-workflow.yml` declare no `concurrency:`, so N rapid triggers spawn N
independent jobs, each checking out the same `change/<name>` branch and each running a
non-forced `git push origin HEAD:refs/heads/change/<name>` (`apply.yml:173`). The
losers' pushes are rejected non-fast-forward and fail at the push step — and the
**newer** trigger can be the loser, the opposite of "latest wins."

The result side already coalesces at the **PR layer**: `markRunPrOpened` (`db.ts:46`)
flips *every* `dispatched` row for the branch in one statement, so the first returning
result opens one PR / fires one CI-refresh and later results classify `ignore`. So N
triggers yield exactly one PR today — but N apply *jobs* still ran and raced, and a
narrow read→act→update window (`push.ts:41` read, `push.ts:106` update) lets two
near-simultaneous **result** pushes both observe a dispatched run and both act
(double CI-refresh; duplicate PR is separately caught by `findOpenPr`).

This change builds on the HMAC-keyed, TTL-swept run-state shipped in
`harden-backend-privacy` and does not revisit it. Background:
`openspec/_planning/briefing-apply-concurrency.md`, `HIGH-LEVEL-DESIGN.md`,
`briefing-wire.md §2(A)`.

## Goals / Non-Goals

**Goals:**
- Rapid same-branch `@specfly:apply` triggers resolve to **exactly one effective apply**,
  latest wins: the superseded apply is cancelled before it can push.
- Every adopter referencing `@v1` inherits the guard with **no change to their copied
  caller**.
- The result-side claim is **atomic**: a losing concurrent or redelivered `result`
  webhook provably no-ops — no duplicate PR, no double CI-refresh commit.
- No regression: still re-dispatches on a new sha; still exactly one PR per branch.

**Non-Goals:**
- No change to trigger/result/ignore classification (`src/logic.ts`) or the
  `@specfly:apply` marker.
- No change to the `client_payload` contract, GitHub permissions, the privacy model,
  or the prerequisite/package-manager policy.
- The `head_sha` checkout hardening (`briefing-wire.md §2(A)`) is cross-referenced, not
  implemented here (cancel mode makes its concurrent-trigger race moot).
- No deploy, secret-setting, or App re-registration (the maintainer's gated runbook).

## Decisions

**Guard lives in the reusable `apply.yml`, at the job level.** Adopters **copy** the
caller (`examples/adopter-workflow.yml`), so a caller-only guard would miss everyone
who already copied it; putting the guard in the reusable workflow reaches every `@v1`
referencer with zero adopter action. Within the reusable workflow the guard is declared
at the **job level** (`jobs.apply.concurrency`), not top-level: job-level concurrency is
unambiguously honored for called workflows and groups span all workflow runs in the
repo, so the N caller runs spawned by N dispatches share one group and coalesce.
*Rejected:* caller-only (misses copiers); top-level `concurrency` in the reusable
workflow (its evaluation context for a called workflow is less certain than a job-level
group, and buys nothing here).

**Group key `specfly-apply-${{ inputs.change }}`, `cancel-in-progress: true`.** The
group is keyed on `inputs.change` — the value the caller passes from
`client_payload.change` — because inputs are unambiguously available **inside** the
reusable workflow, unlike `github.event.client_payload.*`, whose resolution in the
called context is exactly the uncertainty the briefing flags. Concurrency groups are
already scoped per-repository, so `specfly-apply-<change>` is per-repo, per-change.
`cancel-in-progress: true` realizes "latest wins": a newer trigger's job cancels the
in-flight apply before it reaches the push step, so the stale job never clobbers the
branch. *Rejected:* `cancel-in-progress: false` (queue) — every superseded apply still
runs to completion and pushes, just serialized; more compute and the "stale apply still
pushes" race persists in slow motion.

```yaml
jobs:
  apply:
    concurrency:
      group: specfly-apply-${{ inputs.change }}
      cancel-in-progress: true
    runs-on: ubuntu-latest
    ...
```

**Backend (issue B): claim before acting.** Reorder the result path so the atomic claim
**gates** the GitHub action, instead of acting then marking:

1. `markRunPrOpened(db, branchDigest)` is changed to **return rows-affected**
   (`result.meta.changes`). The claim is a single
   `UPDATE runs SET status='pr_opened' … WHERE repo_branch_key=? AND status='dispatched'`
   — one statement, which D1 executes atomically and serializes against concurrent
   writers.
2. The handler runs the claim **first**. If it claimed `0` rows, another concurrent or
   redelivered result already claimed the branch → **return (no-op)**.
3. Only on a claim of `≥1` does it `findOpenPr` → `openPullRequest` (none open) or
   `pushEmptyCommit` (PR open).

D1 serializes the two concurrent UPDATEs: the first flips the branch's `dispatched`
row(s) (`changes ≥ 1`), the second sees none dispatched (`changes = 0`) and no-ops. This
closes the read→act→update TOCTOU without a multi-statement transaction (none is
available across the intervening GitHub calls) because the claim itself is the single
atomic step. *Rejected:* leaving act-then-mark (the race we are closing); a
`BEGIN…COMMIT` spanning the GitHub calls (D1 has no interactive transaction across
awaits, and holding a write lock across network I/O is wrong anyway).

**`head_sha` checkout: cross-reference, do not bundle.** Under `cancel-in-progress`, the
superseded apply is cancelled before it pushes, so the head_sha race it guards against
is moot for concurrent triggers. Bundling it would expand `apply.yml` inputs and the
caller contract for marginal benefit. It stays an independent decision in the
apply.yml-wiring track (`briefing-wire.md §2(A)`).

## Risks / Trade-offs

- **Cancel discards a partly-done apply's compute** → a superseded apply may have spent
  Claude API budget before being cancelled. *Mitigation:* this is the explicit "latest
  wins" intent; the spend is bounded and the superseded output was about to be discarded
  by the push race anyway. Accepted.
- **Claim-then-action-failure orphans a `pr_opened` row** → if the atomic claim succeeds
  but `openPullRequest` then throws (GitHub 5xx), the row is `pr_opened` with no PR; the
  webhook redelivery finds no `dispatched` run and no-ops, so the PR is not opened
  automatically. *Mitigation:* recoverable — a fresh `@specfly:apply` (new sha) creates a
  new dispatched run and re-opens; the `ephemeral-state` TTL sweeps the orphan. This is a
  strictly better trade than the prior act-then-mark, whose mark-failure path *double*-
  fired the CI-refresh. Documented in the README. *Rejected:* compensating "un-claim on
  failure" (its own races, more complexity, low value).
- **`inputs.change` empty in a direct `change/*` call** → the group degrades to
  `specfly-apply-` and would over-coalesce across changes. *Mitigation:* the production
  path is `repository_dispatch`, where the caller always sets `change`; the direct-branch
  case is not a supported trigger path. Noted, not guarded.
- **Reusable-workflow concurrency must coalesce across separate caller runs** → relies on
  job-level concurrency groups being repo-global across workflow runs. *Mitigation:* this
  is documented GitHub behavior; validated structurally with `actionlint` and the manual
  e2e plan (a true cross-run concurrency assertion is only observable on live GitHub).

## Migration Plan

1. **Workflow:** edit `.github/workflows/apply.yml` (add the job-level `concurrency`);
   add a documenting comment to `examples/adopter-workflow.yml` (no functional change).
   Run `actionlint` on both. The guard reaches adopters only once the change is merged
   and the **`v1` tag is moved** to include it — call this out so the maintainer re-tags
   `@v1` (adopters reference `@v1`, not a pinned sha).
2. **Backend:** edit `src/db.ts` (`markRunPrOpened` returns `meta.changes`) and
   `src/handlers/push.ts` (claim-before-act gate); add a vitest for the losing-result
   no-op; `tsc --noEmit` + `vitest` green. Maintainer step (documented, not executed):
   `wrangler deploy`. Rollback: revert the commit and redeploy; no schema/data change.

## Open Questions

- Defense-in-depth caller guard: should `examples/adopter-workflow.yml` *also* carry a
  top-level `concurrency` for adopters who diverge from `@v1`? Decided **no** for now —
  the reusable guard is authoritative and a second group key could fight the first;
  revisit only if an adopter pins a sha and needs local coalescing.
