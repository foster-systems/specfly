# apply-runner Specification

## Purpose
TBD - created by syncing change wire-apply-runner. Update Purpose after archive.
## Requirements
### Requirement: Check out the dispatched change branch

The reusable apply workflow (`.github/workflows/apply.yml`) SHALL check out the exact
commit the backend dispatched when the caller provides it, falling back to the
`change/<name>` branch tip otherwise. The workflow SHALL accept an optional `head_sha`
input (default empty), and `examples/adopter-workflow.yml` SHALL pass
`head_sha: ${{ github.event.client_payload.head_sha }}`. The checkout `ref:` SHALL
evaluate, in order of preference:

1. `inputs.head_sha` when it is non-empty (checked out as a detached `HEAD`);
2. otherwise `refs/heads/change/<inputs.change>` when `inputs.change` is non-empty;
3. otherwise `github.ref`.

This preserves backward compatibility: an older caller that does not pass `head_sha`
keeps the branch-tip behavior. Because `repository_dispatch` runs the workflow as defined
on the default branch — making the run's `github.ref`/`github.ref_name` the default
branch, not `change/<name>` — the head_sha/branch preference is what places the correct
tree on disk. The checkout step SHALL precede the "Resolve change name" step, and SHALL
retain `fetch-depth: 0` so the dispatched sha is fetchable.

#### Scenario: Dispatched run checks out the dispatched sha

- **WHEN** the workflow is invoked from a `repository_dispatch` caller with
  `inputs.head_sha` set to the trigger sha (and `inputs.change` set to `<name>`)
- **THEN** the checkout `ref:` resolves to that sha, so `/opsx:apply` runs against the
  exact tree the backend dispatched rather than a possibly-moved branch tip

#### Scenario: Caller without head_sha checks out the change branch

- **WHEN** the workflow is invoked with `inputs.change` set to `<name>` but
  `inputs.head_sha` empty (e.g. an older copied caller), the run's `github.ref` being the
  default branch
- **THEN** the checkout `ref:` resolves to `refs/heads/change/<name>`, the human-pushed
  change branch where `openspec/changes/<name>/` exists

#### Scenario: Direct change-branch call falls back to github.ref

- **WHEN** the workflow is called on a `change/*` push with no `inputs.change` and no
  `inputs.head_sha` value
- **THEN** the checkout `ref:` falls back to `github.ref`

#### Scenario: Resolve step succeeds because the right tree is present

- **WHEN** the checkout has placed the dispatched sha (or the `change/<name>` branch) on
  disk and the "Resolve change name" step runs next, preferring `inputs.change`
- **THEN** its `openspec/changes/<name>` existence check passes and the change name
  resolves without altering the existing resolve logic

### Requirement: Author applied commits as the Specfly bot identity

The workflow SHALL configure the commit author/committer as the registered Specfly
App bot: `user.name` `specfly[bot]` and `user.email`
`287375800+specfly[bot]@users.noreply.github.com`, where `287375800` is the App's real
bot user id, hardcoded with no placeholder. This attribution is cosmetic only: it
SHALL NOT be relied upon to make commits GPG-"Verified", and it SHALL NOT change the
webhook `sender` of the result push. The workflow MUST record these facts in comments.

#### Scenario: Commits attribute to the bot identity

- **WHEN** `/opsx:apply` produces commits on the change branch
- **THEN** their author/committer email is
  `287375800+specfly[bot]@users.noreply.github.com` with name `specfly[bot]`

#### Scenario: Identity does not change the result-push sender

- **WHEN** the resulting branch is pushed using the job's `GITHUB_TOKEN`
- **THEN** the push's webhook `sender` is `github-actions[bot]` (not `specfly[bot]`),
  matching the backend's result-detection criteria, regardless of the configured
  commit identity

### Requirement: Push the result branch as the implicit PR-open handshake

The workflow SHALL push the applied `change/<name>` branch using the built-in
`GITHUB_TOKEN` (relying on `actions/checkout`'s default `persist-credentials: true`,
with no custom push token), targeting `HEAD:refs/heads/change/<name>` so it works whether
`HEAD` is a detached checkout of `inputs.head_sha` or the branch checkout. The push SHALL
NOT use `--force` or `--force-with-lease`; if the result commit is not a fast-forward of
the current branch tip (the tip diverged from the checked-out sha during the apply), the
push SHALL fail closed with an explanatory error rather than overwrite newer commits. The
workflow SHALL NOT make any runner → backend callback. The result-commit subject SHALL be
`opsx:apply <name>` and MUST NOT start with `/spec:apply` (which would re-trigger a
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
  `/spec:apply`, so the backend classifies the push as a result, not a new trigger

#### Scenario: Runner-local logs are not committed

- **WHEN** the workflow stages changes for the result commit
- **THEN** `apply.jsonl`, `apply.log`, and `validate.log` are excluded from the commit
  (e.g. via `git reset -- apply.jsonl apply.log validate.log`)

### Requirement: Report apply and validation outcomes

The workflow SHALL surface the `/opsx:apply` exit code and the `openspec validate`
outcome to the run's job summary (`$GITHUB_STEP_SUMMARY`) and as workflow annotations, in
a step that runs `if: always()`. This reporting SHALL be observability-only: it SHALL NOT
gate the result push and SHALL NOT change the job's pass/fail status, and the apply and
validate steps SHALL remain `continue-on-error`. When the apply exit code is non-zero or
validation fails, the step SHALL emit a warning annotation noting that the branch was
still pushed for review. The dead `steps.apply.outputs.exit_code` output (previously
unread) SHALL be consumed by this step.

#### Scenario: Failed apply is reported but still pushes

- **WHEN** `/opsx:apply` exits non-zero
- **THEN** the reporting step records the non-zero exit in the job summary and emits a
  warning annotation, the branch is still pushed, and the job conclusion stays success

#### Scenario: Failed validation is reported but still pushes

- **WHEN** `openspec validate <name>` fails
- **THEN** the reporting step records the failure in the job summary and emits a warning
  annotation, the branch is still pushed, and the job conclusion stays success

#### Scenario: Successful run summarizes outcomes

- **WHEN** both `/opsx:apply` and `openspec validate` succeed
- **THEN** the job summary records both as successful and no warning annotation is emitted

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

### Requirement: Provision the project environment without assuming a package manager

The reusable apply workflow (`.github/workflows/apply.yml`) SHALL NOT require a
`package.json`, SHALL NOT resolve or install an adopter-specific package manager,
and SHALL NOT fail when no recognized package manager is present. The
package-manager resolution, pnpm/bun provisioning, and `<pm> install
--frozen-lockfile` steps SHALL be removed, so the workflow makes no assumption
about the adopter's language or toolchain.

The workflow SHALL retain the Node setup and the global install of
`@anthropic-ai/claude-code` and `@fission-ai/openspec` — these are Specfly's own
runtime, required regardless of the adopter's stack — and SHALL retain checkout,
`openspec validate` (which uses Specfly's own OpenSpec CLI, not adopter
dependencies), commit/push, outcome reporting, and log upload unchanged.

#### Scenario: Non-Node repository runs instead of failing closed

- **WHEN** the workflow runs on an adopter repository that has no `package.json`
  (e.g. a Python, Rust, Go, or Ruby project)
- **THEN** the workflow does not exit early with an error about a missing
  `package.json` or unsupported package manager, and proceeds to run `/opsx:apply`

#### Scenario: Node repository still works without explicit provisioning

- **WHEN** the workflow runs on a pnpm- or bun-managed repository that previously
  relied on the removed provisioning steps
- **THEN** the workflow still checks out, runs `/opsx:apply`, validates, and pushes
  the result branch; the adopter's caller workflow needs no change

#### Scenario: Specfly's own CLIs remain available

- **WHEN** the workflow prepares to run the agent
- **THEN** Node is set up and `@anthropic-ai/claude-code` and `@fission-ai/openspec`
  are installed globally, so `claude` and `openspec validate` run regardless of the
  adopter's stack

### Requirement: Delegate project environment setup to the agent via a sub-agent

The "Run /opsx:apply" step's prompt SHALL instruct the agent to first provision the
project environment using a sub-agent (the Task tool) and then run
`/opsx:apply <name>`. The sub-agent SHALL take its guidance from the repository's
native `CLAUDE.md` / `AGENTS.md` (which Claude Code auto-loads) rather than from a
Specfly-specific convention file. Setup SHALL be best-effort and fail-open: if the
environment cannot be fully provisioned, the agent SHALL still apply the change,
and the branch SHALL still be pushed for human review (consistent with the existing
`continue-on-error` posture). The change SHALL NOT introduce a new adopter
convention file dedicated to setup.

#### Scenario: Setup runs before apply via a sub-agent

- **WHEN** the "Run /opsx:apply" step invokes `claude`
- **THEN** the prompt directs the agent to provision the project environment in a
  sub-agent before running `/opsx:apply <name>`, keeping setup output out of the
  main agent's context

#### Scenario: Setup guidance comes from native repo files

- **WHEN** the adopter documents environment setup (e.g. which package manager,
  toolchain version, or run commands) in `CLAUDE.md` or `AGENTS.md`, optionally
  referencing further `.md` files
- **THEN** the setup sub-agent uses that guidance, and no Specfly-specific setup
  convention file is required

#### Scenario: Failed setup still produces a reviewable PR

- **WHEN** the environment cannot be fully provisioned (e.g. an exotic or
  version-pinned toolchain the runner lacks)
- **THEN** the agent still applies what it can, the result branch is pushed, and the
  human reviews the PR (the adopter's CI re-validates) — the run does not fail
  closed before applying
