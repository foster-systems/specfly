## ADDED Requirements

### Requirement: Public landing page at the apex domain
The system SHALL serve a static landing page at `https://specfly.dev` that
distills the project's public message from the repository's `README.md`. The page
SHALL present the one-line pitch, the "Why Specfly" benefits, a short "How it
works" summary, and outbound links to the GitHub repository and the documentation.
The page SHALL be lean: a single HTML page with no client-side JavaScript
framework and no client build runtime.

#### Scenario: Visitor loads the apex domain
- **WHEN** a visitor requests `https://specfly.dev/`
- **THEN** an HTML page is returned with HTTP 200
- **AND** it shows the Specfly pitch, the benefits, and the "How it works" flow
- **AND** it links to the GitHub repository and the docs

#### Scenario: Page stays lean
- **WHEN** the landing page is delivered
- **THEN** it consists of a single HTML document plus static CSS
- **AND** it loads no JavaScript framework and requires no client-side build step

### Requirement: Curl install command is the centerpiece
The landing page SHALL present the `curl -fsSL https://specfly.dev/install.sh | bash`
command as a prominent, copy-pasteable hero element, matching the command
documented in `README.md`.

#### Scenario: Install command is visible and copyable
- **WHEN** a visitor views the landing page
- **THEN** the `curl -fsSL https://specfly.dev/install.sh | bash` one-liner is
  shown prominently as a copy-pasteable block
- **AND** the command text is byte-identical to the one in `README.md`

### Requirement: install.sh served verbatim at the apex
The system SHALL serve the repository's `install.sh` at
`https://specfly.dev/install.sh`. The served bytes SHALL be identical to the
authoritative `install.sh` at the repository root, with no HTML wrapping or
content transformation, so that `curl -fsSL https://specfly.dev/install.sh | bash`
executes exactly the committed script. The served copy SHALL be derived from the
root `install.sh` at build time (single source of truth), not maintained as an
independent fork.

#### Scenario: Fetching the install script returns the raw script
- **WHEN** a client requests `https://specfly.dev/install.sh`
- **THEN** the response body begins with the `#!/usr/bin/env bash` shebang
- **AND** the body is byte-identical to the repository-root `install.sh`
- **AND** the response is the raw script, not an HTML page

#### Scenario: Unknown paths do not shadow install.sh
- **WHEN** a client requests `https://specfly.dev/install.sh`
- **THEN** the static host returns the script file
- **AND** it does NOT fall back to serving the landing page HTML

#### Scenario: Curl-pipe install runs the committed script
- **WHEN** an adopter runs `curl -fsSL https://specfly.dev/install.sh | bash`
  from inside a clone of their GitHub repo
- **THEN** the installer executes successfully end-to-end
- **AND** the steps it performs match those of the committed `install.sh`

### Requirement: Cloudflare deployment coexists with the backend Worker
The landing site SHALL be deployed to Cloudflare for the apex `specfly.dev` host
without colliding with the existing `specfly` backend Worker that serves
`api.specfly.dev`. The site SHALL be deployable and rollback-able independently of
the backend.

#### Scenario: Site and backend serve distinct hosts
- **WHEN** the site is deployed to `specfly.dev` and the backend to `api.specfly.dev`
- **THEN** requests to the apex return the landing page
- **AND** requests to `api.specfly.dev` continue to reach the backend Worker
- **AND** neither deployment overwrites the other's route

#### Scenario: Site deploys and rolls back on its own
- **WHEN** the maintainer deploys or rolls back the landing site
- **THEN** the operation affects only the apex site
- **AND** the backend Worker, its D1 database, and webhook route are unaffected

### Requirement: Visual design
The landing page SHALL use a sleek, minimal visual design with an emerald-green
accent color.

#### Scenario: Emerald accent applied
- **WHEN** the page renders
- **THEN** the primary accent color is an emerald-green tone
- **AND** the layout is minimal and uncluttered
