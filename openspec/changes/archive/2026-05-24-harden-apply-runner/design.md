## Context

`.github/workflows/apply.yml` is the reusable workflow adopters call via a thin
`repository_dispatch` caller (`examples/adopter-workflow.yml`). The backend↔runner
contract already carries everything we need: the dispatch `client_payload` includes
`change`, `branch` (`change/<name>`), and `head_sha` (the trigger sha) — confirmed in
`backend/src/github.ts` and `backend/src/types.ts`. Two hardening items were explicitly
deferred from `wire-apply-runner` (see the `apply.yml` header and briefing-wire §2A/§5):

1. The checkout uses the branch *tip*
   (`ref: inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref`),
   not the dispatched `head_sha`. A concurrent human push to `change/<name>` can move the
   tip between checkout and push, so the apply can run against / push a different tree
   than the backend dispatched.
2. `Run /opsx:apply` (id `apply`) records its real exit code into
   `steps.apply.outputs.exit_code` but nothing reads it, and `Validate change` is
   `continue-on-error` with its result dropped. Both failures are invisible — the run
   goes green and pushes regardless.

The `apply-concurrency` guard (latest-wins, `cancel-in-progress`) already ships and is
inherited by `@v1` adopters with no caller edit; that guarantee is scoped to the guard
and is independent of the input added here.

## Goals / Non-Goals

**Goals:**
- Make `/opsx:apply` run against the exact sha the backend dispatched when the caller
  provides it, while staying backward-compatible with older callers that don't.
- Never silently clobber newer human work on the branch (fail closed on divergence).
- Surface apply/validate outcomes to the job summary and annotations.

**Non-Goals:**
- Changing push or run pass/fail flow on apply/validate failure — **report-only** is the
  chosen semantics (decided with the maintainer): failures stay visible but still push
  and keep the run green.
- A `branch` input — `change/<name>` is already derived from `inputs.change`.
- Touching the package-manager / OpenSpec prerequisite hard-fails (DESIGN §11.3), the
  Claude invocation, model/effort inputs, log streaming, artifact upload, the
  concurrency guard, or the backend (it already emits `head_sha`).

## Decisions

### 1. Optional `head_sha` input, preferred over the branch tip, with fallback

Add `head_sha` (optional, default `''`) to `apply.yml`'s `workflow_call.inputs`, and in
`examples/adopter-workflow.yml` pass `head_sha: ${{ github.event.client_payload.head_sha }}`.
The checkout `ref:` becomes a nested ternary (Actions evaluates `A && B || C` as a
ternary):

```yaml
ref: ${{ inputs.head_sha != '' && inputs.head_sha || (inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref) }}
```

- `head_sha` set → check out that exact commit (detached HEAD).
- `head_sha` empty (older copied caller, or a direct `change/*` call) → fall back to the
  existing branch-tip expression, which itself falls back to `github.ref`.

`fetch-depth: 0` is retained so the bare sha is fetchable. The "Resolve change name"
step still prefers `inputs.change`, and `openspec/changes/<name>/` exists at `head_sha`
(the trigger sha lives on the change branch), so resolution is unchanged.

- **Alternative — required `head_sha` (no fallback):** rejected. Older callers copied
  before this change don't pass it; a required input would break them and conflict with
  the `apply-concurrency` "adopters need no caller change" expectation.
- **Alternative — also add a `branch` input:** rejected as redundant; the branch is
  `change/${{ inputs.change }}`.

### 2. Push is unchanged in substance and fail-closed on divergence

The existing "Commit and push" step already pushes `HEAD:refs/heads/change/<name>`,
which works from a detached HEAD (head_sha path) and from a branch checkout (fallback)
alike — so no push retarget is needed. We deliberately do **not** add `--force`: when a
`head_sha` checkout's commit is no longer a fast-forward of the branch tip (the tip moved
during the apply), the plain push is rejected and the step fails. That is the intended
fail-closed behavior — we refuse to overwrite newer human commits. We add a clear
`::error::` on rejection explaining divergence, rather than masking it.

This is the one new way the run can turn red, and only in the exceptional divergence case
that the concurrency guard already makes rare; it is not the "report-only" path of
decision 3 (apply/validate failures), which never gates the push.

- **Alternative — `--force-with-lease`/`--force`:** rejected; would clobber concurrent
  human work, the exact hazard head_sha determinism is meant to bound.

### 3. Verify reporting is observability-only

Add a `Report apply & validation outcome` step with `if: always()` that reads
`steps.apply.outputs.exit_code` (already produced) and `steps.validate.outcome` (give the
"Validate change" step `id: validate`; keep it `continue-on-error`, no logic change), and
writes a small table to `$GITHUB_STEP_SUMMARY` plus `::warning` annotations when either
failed. It does **not** gate the push and does **not** fail the job — both apply and
validate keep `continue-on-error`, the branch still pushes, and the run stays green. This
matches the chosen report-only semantics and the prior design's "failure is visible in
the adopter's Actions run" stance, while removing the dead `exit_code` output.

- **Alternative — gate the push / fail the run on failure:** considered and explicitly
  rejected by the maintainer for this change; a failed apply still pushes so the PR
  carries the partial work for human review.

## Risks / Trade-offs

- **head_sha not fetchable** → mitigated by retaining `fetch-depth: 0` (full history),
  so any reachable commit on the branch is present.
- **Divergence-rejected push turns the run red** → intended (fail closed); annotated with
  an explanatory `::error::`. The concurrency guard supersedes in-flight applies, so this
  is rare in practice.
- **Older callers don't pass `head_sha`** → they transparently keep branch-tip checkout;
  no break, just no extra determinism until they re-copy the caller.
- **Report-only hides failures from branch protection** → accepted by decision; the run
  stays green even when apply/validate failed. The summary + annotations and the PR
  review are the safety net.

## Migration Plan

No deploy; no backend change. Adopters who want determinism re-copy
`examples/adopter-workflow.yml` (one added line); those who don't are unaffected.
Validation is `actionlint` on both workflow files plus an Actions-expression sanity check
of the nested ternary. The live end-to-end check stays part of the existing manual e2e
plan (gated on App + backend). Rollback is reverting the workflow edits.

## Open Questions

- DESIGN §11.3 (relaxing the pnpm/bun + OpenSpec prerequisites) stays OPEN and is out of
  scope here.
