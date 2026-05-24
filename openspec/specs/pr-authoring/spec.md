# pr-authoring Specification

## Purpose
TBD - created by archiving change build-backend. Update Purpose after archive.
## Requirements
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

- **WHEN** a human pushes a non-`@specfly:apply` commit to `change/<name>` while a run
  is `dispatched`
- **THEN** the push is not treated as a result and no PR is opened

### Requirement: Open App-authored PR on first apply

On a result, the system SHALL **first atomically claim** the branch's `dispatched`
run by transitioning it to `pr_opened` — a single
`UPDATE … WHERE repo_branch_key=? AND status='dispatched'` that reports the number of
rows changed — and SHALL proceed only if it claimed at least one run. A result that
claims no run (another concurrent or redelivered result already claimed the branch)
SHALL take no GitHub action. Having claimed, if no open PR exists for the head branch,
the system SHALL mint an installation token and `POST /repos/{owner}/{repo}/pulls` with
`head: "change/<name>"`, `base` the repository default branch, `draft: false`, and a
descriptive title/body. Because the PR is created by the App, it triggers the adopter's
CI and is approvable by a solo maintainer. No PR number is stored — an open PR is
re-discovered via `findOpenPr` when needed. The claim is the single atomic step that
closes the read→act window: of two near-simultaneous results, only one observes a
non-zero rows-changed and acts.

#### Scenario: First result claims the run and opens a PR

- **WHEN** a result arrives, the atomic claim transitions the branch's `dispatched` run
  to `pr_opened` (rows changed ≥ 1), and
  `GET …/pulls?state=open&head={owner}:change/<name>` returns no open PR
- **THEN** the system opens a PR with base = default branch, `draft: false`

#### Scenario: A losing concurrent result no-ops

- **WHEN** two `result` pushes for the same branch are handled near-simultaneously (or a
  result is redelivered) and the atomic claim for the second reports zero rows changed
- **THEN** the second result takes no GitHub action — it opens no second PR and pushes
  no commit

### Requirement: CI-refresh empty commit on re-run

The system SHALL NOT create a duplicate PR on a result where a PR for the head branch
is already open (a re-run). After the **same atomic claim** of the branch's `dispatched`
run (see "Open App-authored PR on first apply"), and only on a successful claim, if a PR
is already open the system SHALL push exactly one empty commit as the App via the Git
Data API — read the branch head ref, read that commit's tree, create a new commit with
the same tree and the head as parent, then fast-forward the ref (no force). A result
that claimed no run SHALL NOT push a refresh commit. The commit subject MUST NOT start
with `@specfly:apply`. This push arrives as `specfly[bot]`, so it re-fires the adopter's
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

