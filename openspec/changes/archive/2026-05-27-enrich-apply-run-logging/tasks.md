## 1. Enrich the apply-step distillation

- [x] 1.1 In `.github/workflows/apply.yml` "Run /opsx:apply", write a header to `apply.log` (`model:`/`effort:` then `---`) before the agent runs.
- [x] 1.2 Replace the inline `jq` filter with remcc's `tool_summary` function: per-tool input lines (Bash/Read/Edit/MultiEdit/Write/Grep/Glob/WebFetch/WebSearch/Task/TodoWrite + truncated-JSON fallback), an `[init] model=… cwd=…` line for `system`/`init`, assistant text verbatim, and `[done] subtype=… cost_usd=…` (with `.cost_usd` fallback) for `result`.
- [x] 1.3 Pipe the stream as `tee -a apply.jsonl | jq --unbuffered -r '…' | tee -a apply.log` so the distillation also appears live on the console.
- [x] 1.4 Keep `set -o pipefail`, record `exit_code=${PIPESTATUS[0]}` to `$GITHUB_OUTPUT`, then `exit "${status}"`; leave the step `continue-on-error: true`.

## 2. Capture the validate step

- [x] 2.1 In the "Validate change" step, run under `set -o pipefail` and `openspec validate "${CHANGE_NAME}" 2>&1 | tee validate.log`, then `exit "${PIPESTATUS[0]}"`; keep `continue-on-error: true` so `steps.validate.outcome` still drives the report.

## 3. Keep logs out of the commit and upload them

- [x] 3.1 In "Commit and push change branch", broaden the exclusion to `git reset -- apply.jsonl apply.log validate.log` and update the surrounding comment to name all three runner-local logs.
- [x] 3.2 In "Upload agent logs", add `apply.log` and `validate.log` to the artifact `path:` list alongside `apply.jsonl`, keeping `if-no-files-found: ignore` and `retention-days: 14`.

## 4. Verify

- [x] 4.1 Lint the workflow YAML (e.g. `actionlint .github/workflows/apply.yml` or a YAML parse) and confirm the embedded `jq` program parses (`jq -n '<program>'` smoke check against a sample NDJSON line per event type: init, assistant-with-tool_use, result).
- [x] 4.2 Run `openspec validate enrich-apply-run-logging` and confirm it passes.
- [x] 4.3 Confirm no out-of-scope drift: no `/opsx:verify` step, no PR comment/PR-body code, no config-file model/effort resolution added; apply + validate remain `continue-on-error`; result-commit subject unchanged.
