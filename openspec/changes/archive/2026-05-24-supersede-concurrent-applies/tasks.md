## 1. Workflow concurrency guard (issue A)

- [x] 1.1 `.github/workflows/apply.yml` — add a **job-level** `concurrency` to the `apply` job: `group: specfly-apply-${{ inputs.change }}`, `cancel-in-progress: true`. Place it on the job (alongside `runs-on`/`permissions`), not at the workflow top level
- [x] 1.2 Add a comment on the guard stating the intent (latest wins; a newer trigger cancels the in-flight apply before its push step) and why the key is `inputs.change` (available in the called-workflow context, unlike `github.event.client_payload.*`)
- [x] 1.3 `examples/adopter-workflow.yml` — add a documentation-only comment noting that superseding/concurrency is handled by the reusable workflow (`@v1`); make **no** functional change to the caller
- [x] 1.4 `actionlint` clean on both `.github/workflows/apply.yml` and `examples/adopter-workflow.yml`; confirm the `concurrency.group` expression parses

## 2. Result-path atomic claim (issue B)

- [x] 2.1 `backend/src/db.ts` — change `markRunPrOpened` to **return rows-affected** (`result.meta.changes` from `.run()`), keeping the single-statement `UPDATE … SET status='pr_opened' … WHERE repo_branch_key=? AND status='dispatched'`
- [x] 2.2 `backend/src/handlers/push.ts` — in the `result` branch, run the claim **first**: call `markRunPrOpened` and `return` (no-op) if it claimed `0` rows; only on `≥1` proceed to `findOpenPr` → `openPullRequest` (no open PR) / `pushEmptyCommit` (PR open). Remove the trailing `markRunPrOpened` call (it now precedes the action)
- [x] 2.3 Confirm no behavioral change to trigger handling, `classifyPush`, or the `client_payload` contract; the claim gate is the only result-path change

## 3. Tests

- [x] 3.1 Add a vitest covering the losing-result no-op: a `result` whose claim returns `0` rows performs no `openPullRequest` and no `pushEmptyCommit` (assert the GitHub calls are not made)
- [x] 3.2 Confirm the first/winning result still claims (`changes ≥ 1`) and opens a PR (no open PR) / pushes one empty commit (PR open)
- [x] 3.3 `vitest` passes (existing `logic.test.ts`/`state.test.ts`/`signature.test.ts` stay green); `tsc --noEmit` passes

## 4. Docs

- [x] 4.1 `backend/README.md` — document the supersede/latest-wins semantics (reusable-workflow `concurrency`, `cancel-in-progress`) and the atomic-claim guarantee (a losing/redelivered result no-ops); note the claim-then-action-failure orphan is recoverable via re-apply and TTL-swept
- [x] 4.2 Note for the maintainer (README or PR description): the guard reaches adopters only once the **`v1` tag is moved** to include this change (adopters reference `@v1`); and cross-reference the optional `head_sha` checkout hardening (`briefing-wire.md §2(A)`) as a separate, still-independent decision

## 5. Final check

- [x] 5.1 `actionlint` clean; `vitest` + `tsc --noEmit` green
- [x] 5.2 Re-confirm guardrails: backend still re-dispatches on a new sha (no `apply-dispatch` regression); exactly one PR / one CI-refresh per branch under the rapid-trigger race; no new GitHub permission; `src/logic.ts` and the `@specfly:apply` marker untouched
- [x] 5.3 `openspec validate "supersede-concurrent-applies"` passes
