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
`opsx:apply <name>` and MUST NOT start with `/sfx:apply` (which would re-trigger a
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
  `/sfx:apply`, so the backend classifies the push as a result, not a new trigger

#### Scenario: Runner-local logs are not committed

- **WHEN** the workflow stages changes for the result commit
- **THEN** `apply.jsonl`, `apply.log`, and `validate.log` are excluded from the commit
  (e.g. via `git reset -- apply.jsonl apply.log validate.log`)
