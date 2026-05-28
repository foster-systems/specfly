# webhook-gateway Specification

## Purpose
TBD - created by archiving change build-backend. Update Purpose after archive.
## Requirements
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

### Requirement: Per-request installation-token minting

When a handler needs to call the GitHub API, the system SHALL mint a short-lived
installation token using the App id and private key, scoped to the installation id
from the webhook payload. Tokens SHALL be minted per request and never persisted.

#### Scenario: Token minted from payload installation id

- **WHEN** a handler must call the GitHub API for a webhook carrying `installation.id`
- **THEN** the system authenticates as that installation using the App credentials
- **AND** does not store the minted token anywhere

### Requirement: Public webhook ingress over a stable HTTPS custom domain

The system SHALL be reachable by GitHub at a stable custom domain over HTTPS, and the
GitHub App's webhook URL SHALL target `https://api.specfly.dev/webhook`. The Worker route
SHALL be configured with `custom_domain = true` for `api.specfly.dev` in
`backend/wrangler.toml`, which auto-provisions the DNS record and TLS certificate from the
`specfly.dev` Cloudflare zone. The host carries no behavior: signature verification, event
routing, dispatch, and the scheduled TTL sweep are all host-agnostic, so changing the host
SHALL NOT change any other requirement in this capability.

#### Scenario: Health endpoint reachable at the custom domain

- **WHEN** a client sends `GET /` to `https://api.specfly.dev` over HTTPS with a valid TLS
  certificate
- **THEN** the system responds `200` with a plain-text body, exactly as for any other host

#### Scenario: Signed delivery accepted at the custom domain

- **WHEN** GitHub sends a validly-signed `POST https://api.specfly.dev/webhook`
- **THEN** the system verifies the signature and acknowledges with a `2xx`, and a
  corrupted-signature delivery to the same URL is rejected with `401`

### Requirement: Host migration preserves in-flight deliveries

When the public ingress host changes, the system SHALL keep the previous host resolving and
answering until the GitHub App's webhook URL has been repointed to the new host, so that no
signed delivery is dropped during the cutover. The new host's route SHALL be deployed and
verified reachable over HTTPS before the App's webhook URL is repointed. Repointing the App
webhook URL is the atomic cutover; rollback SHALL be repointing it back to the previous
host, which remains available.

#### Scenario: Old host keeps answering until the App URL is repointed

- **WHEN** the new `api.specfly.dev` route is deployed but the GitHub App's webhook URL
  still points at the previous host
- **THEN** GitHub's deliveries continue to reach the previous host and are acknowledged, so
  no delivery is lost before the cutover

#### Scenario: New host is verified before cutover

- **WHEN** the maintainer prepares to repoint the GitHub App's webhook URL to
  `https://api.specfly.dev/webhook`
- **THEN** `api.specfly.dev` has already been confirmed to serve valid TLS and a `200`
  health check, so the cutover does not move traffic to an unreachable host

#### Scenario: Rollback repoints to the still-resolving previous host

- **WHEN** the new host misbehaves after cutover
- **THEN** the maintainer repoints the GitHub App's webhook URL back to the previous host,
  which is still resolving, and deliveries resume without data migration

