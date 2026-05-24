## Why

The reusable apply workflow works, but its own header flags two deferred hardening
gaps (briefing-wire §2A/§5):

1. **Non-deterministic checkout.** It checks out the `change/<name>` branch *tip*, so
   if a human pushes to that branch while an apply is in flight, the tree `/opsx:apply`
   runs against — and the tree that gets pushed — can differ from the sha the backend
   dispatched. The backend already sends `client_payload.head_sha`, so closing this is
   mostly wiring.
2. **Silent apply/validate failures.** `Run /opsx:apply` and `Validate change` both run
   `continue-on-error` with their results discarded — the apply step even stashes
   `exit_code` into a step output nothing reads. An apply that errors or a change that
   fails `openspec validate` is invisible: the run still goes green and still pushes.

## What Changes

- **Deterministic checkout against the dispatched sha.** Add an optional `head_sha`
  input to `apply.yml` and pass it through from `examples/adopter-workflow.yml`
  (`client_payload.head_sha`). When set, check out that exact sha (detached) so
  `/opsx:apply` runs against the tree the backend saw; the result still pushes to
  `HEAD:refs/heads/change/<name>`. When the input is empty — e.g. an older copied
  caller — fall back to the current branch-tip checkout (which itself falls back to
  `github.ref`). **No force push:** a diverged branch tip fails closed (the
  `apply-concurrency` guard already supersedes in-flight applies, so divergence is the
  exceptional case and must not silently clobber newer human work).
- **Verify reporting (observability only).** Surface the `/opsx:apply` exit code and
  the `openspec validate` result to the job summary (`$GITHUB_STEP_SUMMARY`) and as
  `::warning`/`::notice` annotations. Nothing else changes: both steps stay
  `continue-on-error`, the branch still pushes, and the run stays green unless an infra
  step errors. _(Decision: report-only — failures stay visible without blocking the PR,
  matching the existing "failure is visible in the adopter's Actions run" stance.)_
- Drop the "future hardening" TODO from the `apply.yml` header and mark `STATUS.md`
  pickup item 1 complete.

**Out of scope (do not touch):** the package-manager / OpenSpec prerequisite hard-fails
(DESIGN §11.3, still unsettled); the Claude invocation, model/effort inputs, log
streaming, artifact upload; the `apply-concurrency` guard (already shipped); the backend
(it already emits `head_sha`).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `apply-runner`: the checkout SHALL prefer the dispatched `head_sha` when the caller
  passes it (with a branch-tip fallback for older callers); the result push to
  `change/<name>` SHALL be fail-closed on divergence (no force push); and the workflow
  SHALL report the apply exit code and validation outcome to the job summary and as
  annotations, without changing the push or the run's pass/fail behavior.

## Impact

- `.github/workflows/apply.yml` — new optional `head_sha` input; checkout `ref:`; a
  reporting step after apply/validate; header TODO removed.
- `examples/adopter-workflow.yml` — add `head_sha: ${{ github.event.client_payload.head_sha }}`
  passthrough. This is the first caller change since v1's caller shipped; old copied
  callers degrade gracefully to the branch-tip checkout (no break), and the
  `apply-concurrency` "no caller change" guarantee is unaffected (it concerns the guard,
  which still needs no caller edit).
- `openspec/_planning/STATUS.md` — pickup item 1 marked complete.
- No backend change (it already sends `head_sha`); no deploy.
- Validation: `actionlint` clean on both workflow files.
