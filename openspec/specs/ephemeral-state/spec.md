# ephemeral-state Specification

## Purpose
TBD - created by syncing change harden-backend-privacy. Update Purpose after archive.
## Requirements
### Requirement: Non-attributable persisted identifiers

The system SHALL persist run state keyed only by HMAC-SHA256 digests of identifiers
computed under a dedicated, server-held `STATE_HMAC_KEY` secret. It SHALL NOT store
plaintext repository names, account names, branch names, change names, commit shas, or
PR numbers. Because the backend always has the plaintext from the live webhook
payload at decision time, lookups SHALL recompute the digest from the payload and
match by digest, never by stored plaintext.

#### Scenario: A stored run carries no plaintext identity

- **WHEN** the system writes a run row
- **THEN** the row contains only HMAC key digests, a `status`, and a timestamp
- **AND** it contains no plaintext repository, account, branch, change name, sha, or PR number

#### Scenario: Lookup recomputes the key from the payload

- **WHEN** the system must find a run for an inbound webhook
- **THEN** it derives the HMAC digest from the payload identifiers and matches on that digest

### Requirement: Bounded retention via scheduled cleanup

The system SHALL run a scheduled job that deletes run rows whose `updated_at` is older
than a configured TTL (default 7 days), so persisted state reflects recent activity
rather than cumulative history. The TTL MUST exceed the maximum in-flight apply time
and the webhook-redelivery window. The cleanup SHALL be idempotent (safe to run any
number of times).

#### Scenario: Aged rows are deleted, recent rows kept

- **WHEN** the scheduled cleanup runs
- **THEN** every run row older than the TTL is deleted
- **AND** rows newer than the TTL are retained

#### Scenario: No-result dispatched run is eventually reclaimed

- **WHEN** a `dispatched` run produces no result and ages past the TTL
- **THEN** the scheduled cleanup deletes it, so no row persists indefinitely

### Requirement: No identifying data in logs

The system SHALL NOT write repository names, account names, or other adopter
identifiers to logs, so logs cannot become a side-channel ledger of who uses the tool.

#### Scenario: Handling an event emits no identifiers

- **WHEN** the system processes a `push` or `installation` event
- **THEN** any log output omits repository and account identifiers
