## ADDED Requirements

### Requirement: Push classification

The system SHALL classify each inbound `push` event as exactly one of `trigger`,
`result`, or `ignore`, using pure (I/O-free) logic over the payload plus whether a
`dispatched` run already exists for the branch. A push on a non-`change/*` ref, or
any push it cannot positively classify, SHALL be `ignore`.

#### Scenario: Human apply commit classifies as trigger

- **WHEN** a `push` targets `refs/heads/change/<name>`, its tip-commit subject starts
  with `@specfly:apply`, and the sender is not `github-actions[bot]`
- **THEN** classification is `trigger`

#### Scenario: Runner result push classifies as result

- **WHEN** a `push` targets `refs/heads/change/<name>`, the sender is
  `github-actions[bot]`, and a `dispatched` run exists for that branch
- **THEN** classification is `result`

#### Scenario: App CI-refresh push classifies as ignore

- **WHEN** a `push` targets `refs/heads/change/<name>`, the sender is `specfly[bot]`,
  and the tip-commit subject does not start with `@specfly:apply`
- **THEN** classification is `ignore` (it is neither a trigger nor a result, so it cannot loop)

#### Scenario: Non-change branch is ignored

- **WHEN** a `push` targets a ref that is not under `refs/heads/change/`
- **THEN** classification is `ignore`

### Requirement: Trigger detection criteria

The system SHALL treat a `push` as an apply trigger only when ALL hold: the ref is
under `refs/heads/change/` (yielding `branch` and `change_name`); the **first line**
of the tip commit (`head_commit`) message, after trimming leading whitespace, starts
with `@specfly:apply` (case-sensitive); the sender is not `github-actions[bot]`; and
no `runs` row already exists for `(repo_full_name, trigger_sha)`. Only the tip commit
SHALL be evaluated, even when the push contains multiple commits.

#### Scenario: Only the tip commit is evaluated

- **WHEN** a push to `change/<name>` contains several commits and only `head_commit`'s
  subject starts with `@specfly:apply`
- **THEN** the push is a trigger evaluated against the tip commit's subject and sha

#### Scenario: Prefix must be on the first line

- **WHEN** the tip-commit subject's first line does not start with `@specfly:apply`
  (e.g. the marker appears only in the body)
- **THEN** the push is not a trigger

### Requirement: Apply-argument parsing

The system SHALL optionally parse `key=value` tokens following the `@specfly:apply`
prefix on the first line, recognizing `model` and `effort` and ignoring unknown keys.
Absence of these tokens SHALL be valid.

#### Scenario: Known args parsed, unknown ignored

- **WHEN** the trigger subject is `@specfly:apply model=opus effort=high foo=bar`
- **THEN** `model` is `opus`, `effort` is `high`, and `foo` is ignored

#### Scenario: No args yields empty options

- **WHEN** the trigger subject is exactly `@specfly:apply`
- **THEN** parsing yields no `model` and no `effort`

### Requirement: Repository dispatch on trigger

On a trigger, the system SHALL mint an installation token and
`POST /repos/{owner}/{repo}/dispatches` with `event_type` `specfly-apply` and a
`client_payload` containing `change`, `branch` (`change/<name>`), `head_sha` (the
trigger sha), and optional `model`/`effort`, keeping `client_payload` to at most 10
top-level keys.

#### Scenario: Dispatch fired with correct payload shape

- **WHEN** a trigger for `change/foo` at sha `abc123` is processed
- **THEN** the system fires `repository_dispatch` with `event_type` `specfly-apply`
  and `client_payload` `{ change: "foo", branch: "change/foo", head_sha: "abc123", … }`

### Requirement: Run recording and idempotency

On a successful dispatch the system SHALL `INSERT` a `runs` row with
`status="dispatched"`, the `trigger_sha`, and the trigger delivery id. A unique index
on `(repo_full_name, trigger_sha)` together with the pre-dispatch "no existing run"
check SHALL prevent a double dispatch on webhook redelivery, while a new
`@specfly:apply` commit (new sha) SHALL create a new run and re-dispatch.

#### Scenario: Redelivery does not double-dispatch

- **WHEN** GitHub redelivers the same trigger push (same `repo_full_name` and `trigger_sha`)
- **THEN** the existing run is detected and no second dispatch is fired

#### Scenario: Re-apply with a new sha re-dispatches

- **WHEN** a developer pushes a second `@specfly:apply` commit (new sha) to the same branch
- **THEN** a new `dispatched` run row is created and a fresh dispatch is fired
