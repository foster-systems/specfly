## MODIFIED Requirements

### Requirement: Open App-authored PR on first apply

On a result with no open PR for the head branch, the system SHALL mint an
installation token and `POST /repos/{owner}/{repo}/pulls` with
`head: "change/<name>"`, `base` the repository default branch, `draft: false`, and a
descriptive title/body. Because the PR is created by the App, it triggers the
adopter's CI and is approvable by a solo maintainer. The system SHALL then `UPDATE`
the run row (found by `repo_branch_key`) to `status="pr_opened"`. No PR number is
stored — an open PR is re-discovered via `findOpenPr` when needed.

#### Scenario: First result opens a PR and records it

- **WHEN** a result arrives and `GET …/pulls?state=open&head={owner}:change/<name>`
  returns no open PR
- **THEN** the system opens a PR with base = default branch, `draft: false`
- **AND** updates the run row (by `repo_branch_key`) to `status="pr_opened"`

### Requirement: CI-refresh empty commit on re-run

The system SHALL NOT create a duplicate PR on a result where a PR for the head branch
is already open (a re-run). Instead it SHALL push exactly one empty commit as
the App via the Git Data API — read the branch head ref, read that commit's tree,
create a new commit with the same tree and the head as parent, then fast-forward the
ref (no force). The commit subject MUST NOT start with `@specfly:apply`. This push
arrives as `specfly[bot]`, so it re-fires the adopter's CI (which a `GITHUB_TOKEN`
push to an open PR cannot) yet classifies as `ignore`. The push SHALL be made
unconditionally without reading check state (no `Checks: read` permission). The
matched run row (found by `repo_branch_key`) SHALL be set to `status="pr_opened"` with
`updated_at` bumped, so a redelivered result finds no `dispatched` run and does not
push a second commit.

#### Scenario: Re-run refreshes CI without a duplicate PR

- **WHEN** a result arrives and an open PR already exists for `change/<name>`
- **THEN** the system pushes one empty commit (same tree, fast-forward) as the App
- **AND** does not open a second PR
- **AND** sets the matched run row to `status="pr_opened"` and bumps `updated_at`

#### Scenario: Refresh commit cannot re-trigger

- **WHEN** the App's empty CI-refresh commit's `push` webhook is later delivered
- **THEN** its subject does not start with `@specfly:apply` and its sender is
  `specfly[bot]`, so it classifies as `ignore` and cannot loop

### Requirement: No-result runs remain dispatched

The system SHALL leave a run row at `status="dispatched"` and open no PR when a
dispatched run produces no result push (apply made no changes or failed). Such a row
is no longer retained indefinitely: the `ephemeral-state` scheduled cleanup deletes it
once it ages past the retention TTL. This known-state SHALL be documented in the
backend README.

#### Scenario: Apply with no changes leaves run dispatched

- **WHEN** a dispatched apply produces no runner result push
- **THEN** no PR is opened and the run row stays `status="dispatched"`

#### Scenario: A stale dispatched run is reclaimed

- **WHEN** a `dispatched` run with no result ages past the retention TTL
- **THEN** the scheduled cleanup deletes the row
