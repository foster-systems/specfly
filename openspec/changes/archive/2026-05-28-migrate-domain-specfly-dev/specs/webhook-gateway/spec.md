## ADDED Requirements

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
