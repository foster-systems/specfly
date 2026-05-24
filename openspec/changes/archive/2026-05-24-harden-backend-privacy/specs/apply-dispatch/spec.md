## MODIFIED Requirements

### Requirement: Run recording and idempotency

On a successful dispatch the system SHALL `INSERT` a `runs` row with
`status="dispatched"` keyed by `trigger_key` — the PRIMARY KEY,
`HMAC(STATE_HMAC_KEY, "owner/repo\n<trigger_sha>")` — and `repo_branch_key`,
`HMAC(STATE_HMAC_KEY, "owner/repo\nchange/<name>")`. It SHALL store no plaintext
repository, branch, sha, or delivery identifiers (see the `ephemeral-state`
capability). The unique `trigger_key` together with the pre-dispatch "no existing run"
check SHALL prevent a double dispatch on webhook redelivery, while a new
`@specfly:apply` commit (new sha, hence a new `trigger_key`) SHALL create a new run
and re-dispatch.

#### Scenario: Redelivery does not double-dispatch

- **WHEN** GitHub redelivers the same trigger push (yielding the same `trigger_key`)
- **THEN** the existing run is detected and no second dispatch is fired

#### Scenario: Re-apply with a new sha re-dispatches

- **WHEN** a developer pushes a second `@specfly:apply` commit (new sha → new `trigger_key`) to the same branch
- **THEN** a new `dispatched` run row is created and a fresh dispatch is fired
