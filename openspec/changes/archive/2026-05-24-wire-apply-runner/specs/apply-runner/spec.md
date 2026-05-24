## ADDED Requirements

### Requirement: Check out the dispatched change branch

The reusable apply workflow (`.github/workflows/apply.yml`) SHALL check out the
`change/<name>` branch named by `inputs.change` rather than `github.ref`. Because
`repository_dispatch` runs the workflow as defined on the default branch — making the
run's `github.ref`/`github.ref_name` the default branch, not `change/<name>` — the
checkout `ref:` SHALL evaluate to `refs/heads/change/<inputs.change>` whenever
`inputs.change` is non-empty, and SHALL fall back to `github.ref` only when
`inputs.change` is empty. The checkout step SHALL precede the "Resolve change name"
step, and SHALL retain `fetch-depth: 0`.

#### Scenario: Dispatched run checks out the change branch

- **WHEN** the workflow is invoked from a `repository_dispatch` caller with
  `inputs.change` set to `<name>` (the run's `github.ref` being the default branch)
- **THEN** the checkout `ref:` resolves to `refs/heads/change/<name>`, so the
  human-pushed change branch — where `openspec/changes/<name>/` exists — is checked out

#### Scenario: Direct change-branch call falls back to github.ref

- **WHEN** the workflow is called on a `change/*` push with no `inputs.change` value
- **THEN** the checkout `ref:` falls back to `github.ref`

#### Scenario: Resolve step succeeds because the right tree is present

- **WHEN** the checkout has placed the `change/<name>` branch on disk and the
  "Resolve change name" step runs next, preferring `inputs.change`
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
with no custom push token), and SHALL NOT make any runner → backend callback. The
result-commit subject SHALL be `opsx:apply <name>` and MUST NOT start with
`@specfly:apply` (which would re-trigger a dispatch loop). The audit log `apply.jsonl`
SHALL be excluded from the commit. A comment SHALL document that this push — observed
as `github-actions[bot]` — is the signal the backend's push webhook handler uses to
open or update the PR as `Specfly[bot]`.

#### Scenario: Result push drives the backend to open the PR

- **WHEN** the apply produced changes and the workflow commits and pushes
  `change/<name>` via `GITHUB_TOKEN`
- **THEN** no callback is made, and the backend's `push` webhook handler opens or
  updates the PR as `Specfly[bot]` in response to that push

#### Scenario: Result commit subject cannot loop

- **WHEN** the workflow commits the applied changes
- **THEN** the commit subject is `opsx:apply <name>` and does not start with
  `@specfly:apply`, so the backend classifies the push as a result, not a new trigger

#### Scenario: Audit log is not committed

- **WHEN** the workflow stages changes for the result commit
- **THEN** `apply.jsonl` is excluded from the commit (e.g. via `git reset -- apply.jsonl`)
