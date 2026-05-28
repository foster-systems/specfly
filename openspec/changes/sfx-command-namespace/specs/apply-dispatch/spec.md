## MODIFIED Requirements

### Requirement: Trigger command namespace

The system SHALL recognize apply triggers under the `/sfx:` command namespace. The
trigger marker is the `/sfx:` prefix immediately followed by a command **verb** on the
**first line** of the tip commit, after trimming leading whitespace. The system SHALL
recognize exactly one verb, `apply`. The bare namespace (`/sfx:`), the namespace
followed by whitespace before any verb (e.g. `/sfx: apply`), and any other verb (e.g.
`/sfx:foo`, `/sfx:applyx`) SHALL NOT be triggers. Matching SHALL be case-sensitive.
The legacy `/spec:apply` prefix SHALL NOT be recognized (it classifies as `ignore`).

#### Scenario: Apply verb is recognized

- **WHEN** the tip-commit first line is `/sfx:apply` (optionally followed by `key=value`
  args)
- **THEN** the recognized command verb is `apply` and the commit is a trigger

#### Scenario: Unknown verb is not a trigger

- **WHEN** the tip-commit first line is `/sfx:foo` or `/sfx:applyx`
- **THEN** no recognized verb matches `apply`, so the push is not a trigger

#### Scenario: Bare namespace is not a trigger

- **WHEN** the tip-commit first line is exactly `/sfx:`, or `/sfx:` followed by
  whitespace (e.g. `/sfx: apply`)
- **THEN** no verb is extracted and the push is not a trigger

#### Scenario: Legacy prefix is no longer recognized

- **WHEN** the tip-commit first line starts with `/spec:apply`
- **THEN** it is not a trigger and the push classifies as `ignore`

### Requirement: Push classification

The system SHALL classify each inbound `push` event as exactly one of `trigger`,
`result`, or `ignore`, using pure (I/O-free) logic over the payload plus whether a
`dispatched` run already exists for the branch. A push on a non-`change/*` ref, or
any push it cannot positively classify, SHALL be `ignore`.

#### Scenario: Human apply commit classifies as trigger

- **WHEN** a `push` targets `refs/heads/change/<name>`, its tip-commit first line is a
  `/sfx:apply` command, and the sender is not `github-actions[bot]`
- **THEN** classification is `trigger`

#### Scenario: Runner result push classifies as result

- **WHEN** a `push` targets `refs/heads/change/<name>`, the sender is
  `github-actions[bot]`, and a `dispatched` run exists for that branch
- **THEN** classification is `result`

#### Scenario: App CI-refresh push classifies as ignore

- **WHEN** a `push` targets `refs/heads/change/<name>`, the sender is `specfly[bot]`,
  and the tip-commit first line is not a `/sfx:apply` command
- **THEN** classification is `ignore` (it is neither a trigger nor a result, so it cannot loop)

#### Scenario: Non-change branch is ignored

- **WHEN** a `push` targets a ref that is not under `refs/heads/change/`
- **THEN** classification is `ignore`

### Requirement: Trigger detection criteria

The system SHALL treat a `push` as an apply trigger only when ALL hold: the ref is
under `refs/heads/change/` (yielding `branch` and `change_name`); the **first line**
of the tip commit (`head_commit`) message, after trimming leading whitespace, is a
`/sfx:apply` command (the `/sfx:` namespace immediately followed by the `apply` verb,
case-sensitive — see "Trigger command namespace"); the sender is not
`github-actions[bot]`; and no `runs` row already exists for
`(repo_full_name, trigger_sha)`. Only the tip commit SHALL be evaluated, even when the
push contains multiple commits.

#### Scenario: Only the tip commit is evaluated

- **WHEN** a push to `change/<name>` contains several commits and only `head_commit`'s
  first line is a `/sfx:apply` command
- **THEN** the push is a trigger evaluated against the tip commit's first line and sha

#### Scenario: Prefix must be on the first line

- **WHEN** the tip-commit first line is not a `/sfx:apply` command
  (e.g. the marker appears only in the body)
- **THEN** the push is not a trigger

### Requirement: Apply-argument parsing

The system SHALL optionally parse `key=value` tokens following the `/sfx:apply` command
on the first line, recognizing `model` and `effort` and ignoring unknown keys.
Absence of these tokens SHALL be valid.

#### Scenario: Known args parsed, unknown ignored

- **WHEN** the trigger first line is `/sfx:apply model=opus effort=high foo=bar`
- **THEN** `model` is `opus`, `effort` is `high`, and `foo` is ignored

#### Scenario: No args yields empty options

- **WHEN** the trigger first line is exactly `/sfx:apply`
- **THEN** parsing yields no `model` and no `effort`

### Requirement: Run recording and idempotency

On a successful dispatch the system SHALL `INSERT` a `runs` row with
`status="dispatched"` keyed by `trigger_key` — the PRIMARY KEY,
`HMAC(STATE_HMAC_KEY, "owner/repo\n<trigger_sha>")` — and `repo_branch_key`,
`HMAC(STATE_HMAC_KEY, "owner/repo\nchange/<name>")`. It SHALL store no plaintext
repository, branch, sha, or delivery identifiers (see the `ephemeral-state`
capability). The unique `trigger_key` together with the pre-dispatch "no existing run"
check SHALL prevent a double dispatch on webhook redelivery, while a new
`/sfx:apply` commit (new sha, hence a new `trigger_key`) SHALL create a new run
and re-dispatch.

#### Scenario: Redelivery does not double-dispatch

- **WHEN** GitHub redelivers the same trigger push (yielding the same `trigger_key`)
- **THEN** the existing run is detected and no second dispatch is fired

#### Scenario: Re-apply with a new sha re-dispatches

- **WHEN** a developer pushes a second `/sfx:apply` commit (new sha → new `trigger_key`) to the same branch
- **THEN** a new `dispatched` run row is created and a fresh dispatch is fired
