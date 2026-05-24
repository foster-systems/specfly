## ADDED Requirements

### Requirement: Upsert installation on lifecycle add

The system SHALL upsert a row into `installations` keyed by `installation_id` on an
`installation` event with action `created`, `added`, or `new_permissions_accepted`,
recording `account.login` and `account.type`, and respond `2xx`.

#### Scenario: Installation created is upserted

- **WHEN** an `installation` event with action `created` arrives carrying
  `installation.id`, `account.login`, and `account.type`
- **THEN** the system upserts the matching `installations` row and responds `2xx`

#### Scenario: Re-acceptance updates the existing row

- **WHEN** an `installation` event with action `new_permissions_accepted` arrives for
  an already-known installation id
- **THEN** the system updates that row rather than creating a duplicate

### Requirement: Delete installation on lifecycle removal

On an `installation` event with action `deleted`, the system SHALL delete the
matching `installations` row and respond `2xx`.

#### Scenario: Installation deleted removes the row

- **WHEN** an `installation` event with action `deleted` arrives for a known installation id
- **THEN** the system deletes that `installations` row and responds `2xx`
