## 1. Deterministic checkout against the dispatched sha

- [x] 1.1 Add an optional `head_sha` input to `apply.yml`'s `workflow_call.inputs` (`required: false`, `type: string`, default `''`), with a description noting it's the dispatched trigger sha and that an empty value falls back to the branch tip.
- [x] 1.2 Change the Checkout step `ref:` to the nested ternary `${{ inputs.head_sha != '' && inputs.head_sha || (inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref) }}`, keeping `fetch-depth: 0`. Update the step comment to explain the head_sha → branch → github.ref preference and that head_sha lands a detached HEAD.
- [x] 1.3 Confirm step order (Checkout → Resolve change name) and the "Resolve change name" logic are unchanged.
- [x] 1.4 In `examples/adopter-workflow.yml`, add `head_sha: ${{ github.event.client_payload.head_sha }}` under `with:`; add a brief comment that this enables determinism and that omitting it is a safe (branch-tip) fallback.

## 2. Fail-closed push from the dispatched sha

- [x] 2.1 In "Commit and push change branch", keep the push as `HEAD:refs/heads/${BRANCH}` via `GITHUB_TOKEN` (works from detached HEAD); do NOT add `--force`/`--force-with-lease`.
- [x] 2.2 On a non-fast-forward push rejection, emit a clear `::error::` explaining the `change/<name>` tip diverged from the checked-out sha (newer commits not overwritten) and let the step fail. Add a comment that this fail-closed behavior is intentional and that the concurrency guard makes divergence rare.
- [x] 2.3 Verify unchanged in substance: commit subject `opsx:apply <name>` (no `@specfly:apply` prefix), `apply.jsonl` excluded via `git reset -- apply.jsonl`, no runner → backend callback.

## 3. Verify reporting (observability-only)

- [x] 3.1 Give the "Validate change" step `id: validate`; keep `continue-on-error: true` and its `openspec validate` command unchanged.
- [x] 3.2 Add a `Report apply & validation outcome` step with `if: always()` that reads `steps.apply.outputs.exit_code` and `steps.validate.outcome`, writes a summary table to `$GITHUB_STEP_SUMMARY`, and emits `::warning` annotations when apply exit ≠ 0 or validate failed (noting the branch was still pushed for review).
- [x] 3.3 Confirm the report step does NOT gate the push and does NOT fail the job (apply + validate keep `continue-on-error`; run stays green unless an infra step errors). Confirm the previously-dead `steps.apply.outputs.exit_code` is now consumed.

## 4. Confirm out-of-scope code is untouched

- [x] 4.1 Confirm the "Resolve package manager" hard-fail and the OpenSpec prerequisite logic are unchanged (DESIGN §11.3 deferred).
- [x] 4.2 Confirm the Claude invocation, model/effort inputs, log streaming, artifact upload, and the `concurrency:` guard are unchanged.

## 5. Docs, validate, and record

- [x] 5.1 Update the `apply.yml` header comment to drop the "verify reporting and the optional head_sha checkout (briefing-wire §2A/§5) remain as future hardening" TODO (now done).
- [x] 5.2 Run `actionlint` on `.github/workflows/apply.yml` and `examples/adopter-workflow.yml`; both must be clean. Sanity-check the nested `ref:` ternary parses as valid Actions syntax.
- [x] 5.3 Update `openspec/_planning/STATUS.md`: move pickup item 1 (apply.yml hardening) to Done with a one-line summary; renumber the remaining pickup items (deploy backend, cut/tag v1).
