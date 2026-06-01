# project-docs Specification

## Purpose

Defines the requirements for the project's documentation set — the `README.md`,
the backend README, and files under `docs/` — so that documentation communicates
value clearly, stays internally consistent, and has a single authoritative home
per topic.

## Requirements

### Requirement: README communicates value before mechanics

The `README.md` SHALL present, within its first screenful (before any
step-by-step setup instructions), a one-line value proposition and the three key
benefits: safe unattended runs in ephemeral isolated environments, cost control
(bring-your-own-key, no token reselling), and composability into larger workflows.

#### Scenario: Benefits appear above setup

- **WHEN** a reader opens `README.md`
- **THEN** the value proposition and the three key benefits appear before the
  adopter setup steps
- **AND** none of the three benefits is omitted

#### Scenario: Setup detail is linked, not inlined

- **WHEN** the README references long-form adopter detail (the full setup steps
  and the "fine-tuning for your stack" guidance)
- **THEN** that detail is reachable via a link to a `docs/` file rather than
  inlined in full in the README

### Requirement: All documentation links resolve

Every documentation link SHALL resolve: each relative markdown link and design reference in the documentation set (the README, the backend README, and files under `docs/`) MUST point to a file or anchor that exists in the repository, so that no documentation link 404s.

#### Scenario: The design link is not broken

- **WHEN** the README links to the project design
- **THEN** the link target exists in the repository
- **AND** no link to a non-existent root `DESIGN.md` remains

#### Scenario: Cross-document links resolve

- **WHEN** any documentation file links to another documentation file by relative
  path
- **THEN** the target path exists

### Requirement: Single documentation index and authoritative source per topic

The documentation set SHALL provide one index that links to each documentation
file with a one-line description, and each topic (design overview, fine-tuning for
your stack, protecting `main`, backend/control-plane reference) SHALL have exactly
one authoritative home that the index points to.

#### Scenario: Index lists every doc

- **WHEN** a reader looks for the documentation map
- **THEN** an index (in the README or `docs/`) lists each documentation file with
  a one-line description

#### Scenario: No duplicated authoritative content

- **WHEN** a topic is documented in more than one file
- **THEN** one file is the authoritative source and the others link to it rather
  than restating its content

### Requirement: Domain references are current

All documentation SHALL reference the current `specfly.dev` domain and App
identity; no stale domain (e.g. `specfly.io`) SHALL remain.

#### Scenario: No stale domain references

- **WHEN** the documentation references the Specfly domain
- **THEN** it uses `specfly.dev`
- **AND** no occurrence of a superseded domain remains
