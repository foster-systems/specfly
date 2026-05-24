## MODIFIED Requirements

### Requirement: Event routing and fast acknowledgement

After a valid signature, the system SHALL route on the `x-github-event` header: it
SHALL handle `push` events, and it SHALL acknowledge every other event — including
`installation` — with a prompt `2xx` (short body) without taking further action.
Installation events are acknowledged but no longer persisted (see the removed
`installation-tracking` capability). All handled deliveries SHALL receive a prompt
`2xx` so GitHub records the delivery as succeeded.

#### Scenario: Unknown event is acknowledged and ignored

- **WHEN** a validly-signed webhook arrives with an `x-github-event` other than `push`
- **THEN** the system responds `2xx` with a short body and takes no other action

#### Scenario: Push event is dispatched to its handler

- **WHEN** a validly-signed webhook arrives with `x-github-event` of `push`
- **THEN** the system routes it to the push handler and returns `2xx` once handled

#### Scenario: Installation event is acknowledged without persistence

- **WHEN** a validly-signed `installation` event arrives
- **THEN** the system responds `2xx`
- **AND** writes nothing to the database
