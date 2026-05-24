## ADDED Requirements

### Requirement: Health endpoint

The system SHALL expose `GET /` returning `200` with a short plain-text body (e.g.
`specfly backend ok`). It MUST NOT touch the database or read any secret.

#### Scenario: Health check returns ok

- **WHEN** a client sends `GET /`
- **THEN** the system responds `200` with a plain-text body
- **AND** no database query or secret access occurs

### Requirement: Raw-body signature verification before parsing

The system SHALL read the raw request body as text and verify its
`x-hub-signature-256` HMAC-SHA256 against `WEBHOOK_SECRET` (via the octokit /
Web Crypto path, never hand-rolled crypto) **before** parsing the JSON. On
verification failure it SHALL respond `401` and perform no further work. Only after a
valid signature SHALL it `JSON.parse` the body and route.

#### Scenario: Valid signature is accepted

- **WHEN** a `POST /webhook` request arrives with an `x-hub-signature-256` that is a
  correct `sha256=` HMAC of the raw body under `WEBHOOK_SECRET`
- **THEN** the system parses the body and proceeds to route the event

#### Scenario: Tampered body or bad signature is rejected

- **WHEN** a `POST /webhook` request arrives whose `x-hub-signature-256` does not
  match the raw body under `WEBHOOK_SECRET`
- **THEN** the system responds `401`
- **AND** does not parse the body, mint a token, query the database, or call GitHub

#### Scenario: Verification runs before any parsing

- **WHEN** a request with an invalid signature carries a malformed or hostile JSON body
- **THEN** the system rejects with `401` without attempting to `JSON.parse` the body

### Requirement: Event routing and fast acknowledgement

After a valid signature, the system SHALL route on the `x-github-event` header,
handling `push` and `installation` events and responding `2xx` (with a short body)
for every other event without acting on it. All handled deliveries SHALL receive a
prompt `2xx` acknowledgement so GitHub records the delivery as succeeded.

#### Scenario: Unknown event is acknowledged and ignored

- **WHEN** a validly-signed webhook arrives with an `x-github-event` other than
  `push` or `installation`
- **THEN** the system responds `2xx` with a short body and takes no other action

#### Scenario: Known event is dispatched to its handler

- **WHEN** a validly-signed webhook arrives with `x-github-event` of `push` or
  `installation`
- **THEN** the system routes it to the corresponding handler and returns `2xx` once handled

### Requirement: Per-request installation-token minting

When a handler needs to call the GitHub API, the system SHALL mint a short-lived
installation token using the App id and private key, scoped to the installation id
from the webhook payload. Tokens SHALL be minted per request and never persisted.

#### Scenario: Token minted from payload installation id

- **WHEN** a handler must call the GitHub API for a webhook carrying `installation.id`
- **THEN** the system authenticates as that installation using the App credentials
- **AND** does not store the minted token anywhere
