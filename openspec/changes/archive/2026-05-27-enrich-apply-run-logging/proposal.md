## Why

When an adopter watches a Specfly apply run, the live Actions log only shows
`→ <tool_name>` for each agent step — you can see *that* the agent ran a tool but
not *what* it did (which file, which command, which search). The `openspec validate`
step produces no captured output at all, so a failing validation is invisible until
the after-the-fact job-summary report. And the only downloadable artifact is the raw
`apply.jsonl` NDJSON, which is unreadable without tooling. remcc already solved this;
R7 ports those fixes so Specfly logs the same way.

## What Changes

- Replace the thin jq distillation in the "Run /opsx:apply" step with remcc's rich
  `tool_summary` function, so each tool line surfaces its key input: `Bash $ <cmd>`,
  `Read/Edit/Write/MultiEdit <file_path>`, `Grep "<pattern>" in <path>`,
  `Glob <pattern>`, `WebFetch <url>`, `WebSearch "<query>"`, `Task[<subagent>] <desc>`,
  `TodoWrite (<n> items)`, with a truncated-JSON fallback for unknown tools.
- Emit an `[init] model=… cwd=…` line from the system/init event (currently dropped),
  and align the closing line to `[done] subtype=… cost_usd=…` with a `.cost_usd`
  fallback.
- Tee the distilled stream to a human-readable `apply.log` (alongside the existing raw
  `apply.jsonl`) *and* the console, prefixed with a short config header recording the
  `model` and `effort` used.
- Make the Validate step tee `openspec validate` output to `validate.log` (with
  `set -o pipefail` + `PIPESTATUS`) so validation is visible live and preserved,
  instead of running silently.
- Extend the result commit's `git reset` to exclude the new `apply.log` and
  `validate.log` (in addition to `apply.jsonl`) so runner-local logs never land in the
  committed change.
- Upload `apply.log` and `validate.log` alongside `apply.jsonl` in the "Upload agent
  logs" artifact.

Non-goals (explicitly NOT ported from remcc): the `/opsx:verify` step, posting a
verify report as a PR comment, PR-body metadata, and model/effort config-file
resolution. In Specfly the *backend* — not the runner — opens and comments on the PR,
and model/effort arrive as workflow inputs; those concerns are out of scope for an
apply-run *logging* change.

## Capabilities

### New Capabilities

<!-- None. This change enriches an existing capability's logging behavior. -->

### Modified Capabilities

- `apply-runner`: Strengthen the run-reporting behavior — the apply step's live/console
  distillation must surface per-tool inputs and `[init]`/`[done]` lines and write a
  human-readable `apply.log`; the validate step must capture `validate.log`; both logs
  join `apply.jsonl` as uploaded artifacts and are excluded from the result commit.

## Impact

- `.github/workflows/apply.yml` — the "Run /opsx:apply", "Validate change", "Commit and
  push change branch", and "Upload agent logs" steps.
- No change to the backend, the dispatch handshake, concurrency, push/PR-open
  behavior, or the result-commit subject. Apply and validate stay `continue-on-error`;
  reporting stays observability-only.
- Reference: `../remcc/templates/workflows/opsx-apply.yml` (the shipped implementation
  being ported).
