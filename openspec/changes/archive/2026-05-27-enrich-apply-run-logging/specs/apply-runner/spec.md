## ADDED Requirements

### Requirement: Stream a readable distillation of the apply and validation runs

The workflow SHALL surface the agent's work in real time and preserve it as
human-readable artifacts, mirroring the remcc reference implementation
(`templates/workflows/opsx-apply.yml`).

The "Run /opsx:apply" step SHALL invoke `claude` with
`--output-format stream-json --verbose`, `tee` the raw NDJSON to `apply.jsonl`
(the full audit trail), pipe it through a `jq --unbuffered` filter, and `tee` the
filter's output to BOTH a human-readable `apply.log` and the Actions console (so the
run is watchable live). The step SHALL retain `set -o pipefail` and record the
agent's real exit code from `PIPESTATUS[0]` to a step output named `exit_code`.

The `jq` distillation SHALL, per NDJSON event:

- For a `system`/`init` event, emit `[init] model=<model> cwd=<cwd>`.
- For an `assistant` event, emit each text block verbatim and each `tool_use` block as
  a single line that surfaces the tool's key input. The tool-line forms SHALL be:
  `→ Bash $ <command>` (newlines collapsed), `→ Read <file_path>`,
  `→ Edit <file_path>`, `→ MultiEdit <file_path> (<n> edits)`, `→ Write <file_path>`,
  `→ Grep "<pattern>"` (with ` in <path>` when a path is present),
  `→ Glob <pattern>`, `→ WebFetch <url>`, `→ WebSearch "<query>"`,
  `→ Task[<subagent>] <description>`, `→ TodoWrite (<n> items)`, and a fallback of
  `→ <name> <input-json-truncated>` for any other tool.
- For a `result` event, emit `[done] subtype=<subtype> cost_usd=<cost>`, reading
  `total_cost_usd` and falling back to `cost_usd`.

`apply.log` SHALL begin with a short header recording the run's `model` and `effort`
before the streamed lines. (Unlike remcc, Specfly receives `model` and `effort` as
workflow inputs, so the header records the values without a source annotation.)

The "Validate change" step SHALL run `openspec validate <name>` under
`set -o pipefail`, `tee` its combined output to `validate.log` so validation is
visible live and preserved, and surface the validate exit status as the step's outcome
(it SHALL remain `continue-on-error`, so a non-zero validate does not fail the job).

The "Upload agent logs" step SHALL upload `apply.log` and `validate.log` alongside the
existing `apply.jsonl`, keeping `if-no-files-found: ignore` and the 14-day retention.

This requirement is logging fidelity only: it SHALL NOT add a verify step, post any PR
comment, write PR-body metadata, or resolve model/effort from config files.

#### Scenario: Tool calls surface their inputs in the live log

- **WHEN** the agent runs tools during `/opsx:apply` (e.g. a `Bash` command, a `Read`,
  an `Edit`, a `Grep`)
- **THEN** the console and `apply.log` show one line per tool call carrying its key
  input — `→ Bash $ <command>`, `→ Read <file_path>`, `→ Edit <file_path>`,
  `→ Grep "<pattern>"` — rather than only `→ <tool_name>`

#### Scenario: Run is framed by init and done lines

- **WHEN** the apply stream starts and finishes
- **THEN** the distillation opens with `[init] model=<model> cwd=<cwd>` and closes with
  `[done] subtype=<subtype> cost_usd=<cost>`

#### Scenario: Human-readable apply log is produced and uploaded

- **WHEN** the apply step runs
- **THEN** a header recording `model` and `effort` is written to `apply.log`, the
  distilled stream is appended to it and echoed to the console, and `apply.log` is
  uploaded in the agent-logs artifact next to the raw `apply.jsonl`

#### Scenario: Validation output is captured rather than silent

- **WHEN** the "Validate change" step runs `openspec validate <name>`
- **THEN** its output is visible in the live log and written to `validate.log`, which is
  uploaded in the agent-logs artifact; a non-zero validation surfaces as the step's
  non-success outcome but does not fail the job

## MODIFIED Requirements

### Requirement: Push the result branch as the implicit PR-open handshake

The workflow SHALL push the applied `change/<name>` branch using the built-in
`GITHUB_TOKEN` (relying on `actions/checkout`'s default `persist-credentials: true`,
with no custom push token), targeting `HEAD:refs/heads/change/<name>` so it works whether
`HEAD` is a detached checkout of `inputs.head_sha` or the branch checkout. The push SHALL
NOT use `--force` or `--force-with-lease`; if the result commit is not a fast-forward of
the current branch tip (the tip diverged from the checked-out sha during the apply), the
push SHALL fail closed with an explanatory error rather than overwrite newer commits. The
workflow SHALL NOT make any runner → backend callback. The result-commit subject SHALL be
`opsx:apply <name>` and MUST NOT start with `@spec:apply` (which would re-trigger a
dispatch loop). The runner-local logs `apply.jsonl`, `apply.log`, and `validate.log` SHALL
be excluded from the commit (they are uploaded as artifacts instead). A comment SHALL
document that this push — observed as `github-actions[bot]` — is the signal the backend's
push webhook handler uses to open or update the PR as `Specfly[bot]`.

#### Scenario: Result push drives the backend to open the PR

- **WHEN** the apply produced changes and the workflow commits and pushes
  `HEAD:refs/heads/change/<name>` via `GITHUB_TOKEN`
- **THEN** no callback is made, and the backend's `push` webhook handler opens or
  updates the PR as `Specfly[bot]` in response to that push

#### Scenario: Diverged branch tip fails the push closed

- **WHEN** a `head_sha` was checked out and the `change/<name>` tip has since moved so the
  result commit is no longer a fast-forward
- **THEN** the non-forced push is rejected, the step fails with an explanatory error, and
  no human commit on the branch is overwritten

#### Scenario: Result commit subject cannot loop

- **WHEN** the workflow commits the applied changes
- **THEN** the commit subject is `opsx:apply <name>` and does not start with
  `@spec:apply`, so the backend classifies the push as a result, not a new trigger

#### Scenario: Runner-local logs are not committed

- **WHEN** the workflow stages changes for the result commit
- **THEN** `apply.jsonl`, `apply.log`, and `validate.log` are excluded from the commit
  (e.g. via `git reset -- apply.jsonl apply.log validate.log`)
