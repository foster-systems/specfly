## Context

Specfly's reusable apply workflow (`.github/workflows/apply.yml`) already streams the
agent's NDJSON through `jq` and uploads `apply.jsonl`. But the distillation is minimal:
each tool call renders as `→ <tool_name>`, the `system`/`init` and richer `result`
fields are dropped, the validate step captures nothing, and the only artifact is raw
NDJSON. remcc (`templates/workflows/opsx-apply.yml`) shipped a more useful version
between 2026-05-11 and 2026-05-17 (commits `1e2057a`, `0c6434e`, `6f30e0c`). R7 ports
that logging behavior so Specfly "logs the same way as remcc."

remcc and Specfly diverge architecturally: remcc's runner also runs `/opsx:verify`,
opens/updates the PR, and posts a verify comment. In Specfly the *backend* opens and
comments on the PR (the runner only codes and pushes), and model/effort are workflow
inputs rather than config-file lookups. So this port copies the logging mechanics, not
remcc's verify/PR-authoring steps.

## Goals / Non-Goals

**Goals:**
- Per-tool log lines that surface the tool's key input (command, path, pattern, etc.).
- `[init]` and `[done]` framing lines.
- A human-readable `apply.log` artifact (with a model/effort header) in addition to the
  raw `apply.jsonl`, tee'd live to the console.
- `validate.log` capture so the validate step is no longer silent.
- Keep runner-local logs out of the result commit; upload them as artifacts.

**Non-Goals:**
- The `/opsx:verify` step, verify PR comments, PR-body metadata (the backend owns the PR).
- Resolving model/effort from config files (they are workflow inputs here).
- Any change to dispatch, concurrency, checkout, push/fail-closed, or the result-commit
  subject. Apply + validate stay `continue-on-error`; the outcome report stays
  observability-only.

## Decisions

**1. Port remcc's `tool_summary` jq function near-verbatim.**
It already covers the tools the apply agent uses (Bash/Read/Edit/MultiEdit/Write/Grep/
Glob/WebFetch/WebSearch/Task/TodoWrite) with a truncated-JSON fallback for the rest.
Rewriting it would only risk drift from the proven reference. Specfly's current filter
keeps the same overall shape (`assistant` text + tool lines, `result` summary), so the
swap is localized to the `jq` program inside the "Run /opsx:apply" step.

**2. Dual-sink the distilled stream: `apply.log` + console.**
`... | tee -a apply.jsonl | jq … | tee -a apply.log`. The raw NDJSON stays the machine
audit trail; `apply.log` is the skimmable artifact and, because `tee` also writes
stdout, the same distilled lines appear live in the Actions log. A small header
(`model: …` / `effort: …` / `---`) is written to `apply.log` first. Specfly's header
omits remcc's `(source: …)` because model/effort are direct inputs — adapting rather
than copying avoids implying a resolution step that does not exist here.

**3. `exit "${status}"` from the apply and validate steps (with `set -o pipefail`).**
remcc captures `PIPESTATUS[0]` and exits with it. Specfly's apply step currently
captures `exit_code` but always exits 0, so the step renders green even on agent
failure. Mirroring remcc — `exit "${status}"` under `continue-on-error` — makes the
*step* reflect the real outcome (red-but-continued) while the job stays green and the
branch still pushes. This is compatible with the existing "Report apply and validation
outcomes" requirement: the report reads `steps.apply.outputs.exit_code` (still emitted)
and `steps.validate.outcome` (now correctly `failure` on a bad validate). Alternative —
keep swallowing the exit — was rejected because it hides per-step failure in the UI for
no benefit.

**4. Capture `validate.log` via `tee`, keeping `continue-on-error`.**
`set -o pipefail; openspec validate "<name>" 2>&1 | tee validate.log; exit
"${PIPESTATUS[0]}"`. This gives live + preserved validate output without changing the
report semantics (`steps.validate.outcome` still drives the job-summary line).

**5. Broaden the commit exclusion and the artifact upload to the new files.**
The commit's `git reset -- apply.jsonl` becomes `git reset -- apply.jsonl apply.log
validate.log` so none of the runner-local logs land in the change branch; the upload
step adds `apply.log` and `validate.log` to its `path:` list. This is the single
spec-level behavior change (captured as the MODIFIED "Push the result branch…"
requirement / "Runner-local logs are not committed" scenario).

## Risks / Trade-offs

- **jq program complexity / portability** → The `tool_summary` function is multi-line
  embedded jq. Mitigation: copy it verbatim from remcc where it is exercised in
  production; the runner already depends on `jq` and `--unbuffered`.
- **Apply step now shows red on agent failure** → Could surprise anyone who reads green
  as "nothing to see." Mitigation: this is the intended, more honest signal; the job
  conclusion and push behavior are unchanged, and the job-summary report still explains
  it. Documented in the workflow comment.
- **A log file collides with a real repo file named `apply.log`/`validate.log`** →
  `git reset` would un-stage a legitimately changed file. Mitigation: these names are
  runner-generated working files at repo root; the same risk already existed for
  `apply.jsonl`. Acceptable and unchanged in kind.

## Migration Plan

Single-file edit to `.github/workflows/apply.yml`; no backend or adopter-caller change.
`@v1` adopters inherit it once `v1` is re-pointed at the merged commit (the existing
release/tagging step for this workflow, same as prior apply.yml fixes). Rollback is a
straight revert of the workflow edit — no state or schema to unwind.

## Open Questions

- None. Scope, sinks, and the exit-code behavior are settled above.
