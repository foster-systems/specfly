## MODIFIED Requirements

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

### Requirement: Push the result branch as the implicit PR-open handshake

The workflow SHALL push the applied `change/<name>` branch using the built-in
`GITHUB_TOKEN` (relying on `actions/checkout`'s default `persist-credentials: true`,
with no custom push token), targeting `HEAD:refs/heads/change/<name>` so it works whether
`HEAD` is a detached checkout of `inputs.head_sha` or the branch checkout. The push SHALL
NOT use `--force` or `--force-with-lease`; if the result commit is not a fast-forward of
the current branch tip (the tip diverged from the checked-out sha during the apply), the
push SHALL fail closed with an explanatory error rather than overwrite newer commits. The
workflow SHALL NOT make any runner → backend callback. The result-commit subject SHALL be
`opsx:apply <name>` and MUST NOT start with `@specfly:apply` (which would re-trigger a
dispatch loop). The audit log `apply.jsonl` SHALL be excluded from the commit. A comment
SHALL document that this push — observed as `github-actions[bot]` — is the signal the
backend's push webhook handler uses to open or update the PR as `Specfly[bot]`.

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
  `@specfly:apply`, so the backend classifies the push as a result, not a new trigger

#### Scenario: Audit log is not committed

- **WHEN** the workflow stages changes for the result commit
- **THEN** `apply.jsonl` is excluded from the commit (e.g. via `git reset -- apply.jsonl`)

## ADDED Requirements

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
