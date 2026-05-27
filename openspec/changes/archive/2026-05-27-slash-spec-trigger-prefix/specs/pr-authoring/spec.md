## MODIFIED Requirements

### Requirement: Result detection criteria

The system SHALL treat a `push` as a runner result only when ALL hold: the ref is
under `refs/heads/change/`; the sender is `github-actions[bot]`; and a `runs` row
exists for `(repo_full_name, branch)` with `status="dispatched"`. A push by a human,
or by `specfly[bot]`, SHALL NOT be a result.

#### Scenario: Runner push with a dispatched run is a result

- **WHEN** `github-actions[bot]` pushes to `change/<name>` and a `dispatched` run
  exists for that branch
- **THEN** the push is handled as a result

#### Scenario: Human push during a dispatched run is not a result

- **WHEN** a human pushes a non-`/spec:apply` commit to `change/<name>` while a run
  is `dispatched`
- **THEN** the push is not treated as a result and no PR is opened

### Requirement: CI-refresh empty commit on re-run

The system SHALL NOT create a duplicate PR on a result where a PR for the head branch
is already open (a re-run). After the **same atomic claim** of the branch's `dispatched`
run (see "Open App-authored PR on first apply"), and only on a successful claim, if a PR
is already open the system SHALL push exactly one empty commit as the App via the Git
Data API — read the branch head ref, read that commit's tree, create a new commit with
the same tree and the head as parent, then fast-forward the ref (no force). A result
that claimed no run SHALL NOT push a refresh commit. The commit subject MUST NOT start
with `/spec:apply`. This push arrives as `specfly[bot]`, so it re-fires the adopter's
CI (which a `GITHUB_TOKEN` push to an open PR cannot) yet classifies as `ignore`. The
push SHALL be made unconditionally without reading check state (no `Checks: read`
permission). Because the claim precedes the action, a redelivered or losing concurrent
result cannot push a second refresh commit.

#### Scenario: Re-run refreshes CI without a duplicate PR

- **WHEN** a result arrives, the atomic claim succeeds (rows changed ≥ 1), and an open
  PR already exists for `change/<name>`
- **THEN** the system pushes one empty commit (same tree, fast-forward) as the App
- **AND** does not open a second PR

#### Scenario: Redelivered result pushes no second refresh commit

- **WHEN** a result push for a branch with an open PR is redelivered (or a losing
  concurrent result is handled) and the atomic claim reports zero rows changed
- **THEN** no second empty commit is pushed

#### Scenario: Refresh commit cannot re-trigger

- **WHEN** the App's empty CI-refresh commit's `push` webhook is later delivered
- **THEN** its subject does not start with `/spec:apply` and its sender is
  `specfly[bot]`, so it classifies as `ignore` and cannot loop
