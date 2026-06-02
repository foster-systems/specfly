# adopter-install-script Specification

## Purpose
Provide a guided shell installer (`install.sh`) that performs the mechanical
one-time Specfly adopter setup — caller workflow, `/sfx:apply` command file,
`ANTHROPIC_API_KEY` secret, and optional `main`-protection ruleset — via the
`gh` CLI, and walks the user through the browser-only steps it cannot automate
(OpenSpec init, GitHub App install, API-key creation). The installer is
preflighted, idempotent, and fail-fast.
## Requirements
### Requirement: Guided one-time installer

The system SHALL provide a shell installer (`install.sh`) that performs the
mechanical one-time Specfly adopter setup and guides the user through the steps it
cannot automate. The installer SHALL be runnable both via a piped fetch
(`curl -fsSL <url> | bash`) and directly from a local checkout (`bash install.sh`),
and SHALL operate against the adopter repository identified by the current Git
`origin`. It SHALL automate, via the `gh` CLI: writing the caller workflow, writing
the `/sfx:apply` command file, setting the `ANTHROPIC_API_KEY` Actions secret, and
(on confirmation) applying the `main`-protection ruleset.

#### Scenario: Installer drives the full mechanical setup

- **WHEN** an adopter runs the installer inside a clone of their GitHub repo with an
  authenticated `gh`
- **THEN** the installer writes `.github/workflows/specfly.yml` and
  `.claude/commands/sfx/apply.md`, sets the `ANTHROPIC_API_KEY` secret, and offers to
  apply the `main` ruleset, leaving the repo ready to trigger `/sfx:apply`

#### Scenario: Runs via piped fetch without a checkout

- **WHEN** the installer is invoked as `curl -fsSL <url> | bash` from inside the
  adopter repo (with no specfly checkout present)
- **THEN** it still completes, obtaining the workflow and command file contents from
  the pinned release ref rather than from local disk

### Requirement: Preflight validation

The installer SHALL verify its own preconditions before mutating anything and SHALL
fail fast with actionable guidance when any are unmet, performing no writes, secret
sets, or API calls on failure. The preconditions are: `git` and the `gh` CLI are
installed; `gh` is authenticated (`gh auth status`); the working directory is inside
a Git repository; and an `origin` remote resolving to a GitHub repository exists.

#### Scenario: Missing or unauthenticated gh

- **WHEN** `gh` is not installed, or `gh auth status` reports the user is not logged in
- **THEN** the installer stops with the install/auth command to run and makes no
  changes to the repository

#### Scenario: Not inside a GitHub repo

- **WHEN** the installer is run outside a Git repository, or `origin` does not resolve
  to a GitHub repository
- **THEN** the installer stops with guidance and makes no changes

### Requirement: Idempotent file authoring

The installer SHALL be safe to re-run. For each file it writes
(`.github/workflows/specfly.yml`, `.claude/commands/sfx/apply.md`) it SHALL detect an
existing file: when absent it SHALL write it; when present and identical to the
source it SHALL report it as already present and skip; when present but different it
SHALL show the difference and prompt before overwriting, defaulting to keeping the
existing file. The installer SHALL NOT force-write or silently overwrite a differing
adopter file.

#### Scenario: File absent is written

- **WHEN** `.github/workflows/specfly.yml` does not exist
- **THEN** the installer creates it from the pinned source content

#### Scenario: Identical file is skipped

- **WHEN** a target file already exists with content identical to the source
- **THEN** the installer reports it as already present and does not rewrite it

#### Scenario: Differing file prompts before overwrite

- **WHEN** a target file exists but differs from the source (e.g. the adopter
  customized it)
- **THEN** the installer shows the difference and asks before overwriting, defaulting
  to keeping the adopter's version

### Requirement: Secret configuration

The installer SHALL set the `ANTHROPIC_API_KEY` Actions secret on the adopter repo
via `gh secret set`. When a secret of that name already exists, the installer SHALL
ask before overwriting it rather than replacing it unprompted. The installer SHALL
NOT print or log the key value.

#### Scenario: Secret is set when absent

- **WHEN** the repo has no `ANTHROPIC_API_KEY` secret
- **THEN** the installer prompts for the key (or reads it from the environment) and
  sets it via `gh secret set`, without echoing the value

#### Scenario: Existing secret prompts before replace

- **WHEN** an `ANTHROPIC_API_KEY` secret already exists
- **THEN** the installer asks before overwriting it and leaves it unchanged if declined

### Requirement: Guided manual steps

The installer SHALL guide the user through the steps it cannot automate, pausing for
explicit confirmation and printing the relevant URLs. These steps are: installing
OpenSpec and running `openspec init` (the hard prerequisite), installing the Specfly
GitHub App in a browser at `github.com/apps/specfly`, and obtaining an Anthropic API
key. The installer SHALL state plainly that it cannot verify the GitHub App install
and SHALL list it as the first thing to check if a later `/sfx:apply` produces no run.

#### Scenario: OpenSpec prerequisite is checked and guided

- **WHEN** the adopter repo is not OpenSpec-initialised (no `openspec/` present)
- **THEN** the installer explains OpenSpec is the hard prerequisite and how to install
  and `openspec init` it before continuing

#### Scenario: App install is guided, not automated

- **WHEN** the installer reaches the GitHub App step
- **THEN** it prints the `github.com/apps/specfly` URL, pauses for the user to confirm
  they installed it, and notes it cannot verify the install

### Requirement: Optional branch protection

The installer SHALL offer to apply the `main`-protection ruleset using the exact
ruleset definition documented in `docs/protect-main.md` (require a pull request with
one approval, restrict deletions, block force pushes, empty bypass list), via
`gh api`. It SHALL prompt before creating the ruleset and SHALL skip when a matching
ruleset already targets the default branch. It SHALL never add `Specfly[bot]` to the
bypass list and SHALL never edit an existing ruleset.

#### Scenario: Ruleset offered and created on confirmation

- **WHEN** no `main`-protection ruleset exists and the user confirms
- **THEN** the installer creates the documented ruleset with an empty bypass list

#### Scenario: Existing ruleset is left untouched

- **WHEN** a ruleset already protects the default branch
- **THEN** the installer reports it and does not modify or duplicate it

### Requirement: Non-interactive safety

The installer SHALL detect when standard input is not a terminal or a non-interactive
flag is supplied, and in that mode it SHALL perform the unambiguous mechanical steps
but SHALL NOT auto-confirm destructive overwrites of differing files or the ruleset
mutation; instead it SHALL print the remaining steps as a checklist.

#### Scenario: Piped run does not auto-mutate settings

- **WHEN** the installer runs without an interactive terminal
- **THEN** it completes the safe mechanical steps and prints — rather than silently
  performs — the ruleset change and any differing-file overwrite

### Requirement: Source-of-truth fidelity

The contents the installer writes SHALL match the specfly repo's source-of-truth
files (`examples/adopter-workflow.yml`, `.claude/commands/sfx/apply.md`) at the pinned
release ref, obtained by fetch (piped run) or from local disk (checkout run). When the
contents cannot be obtained (e.g. offline or a moved ref), the installer SHALL stop
with the manual copy-paste fallback rather than writing partial or stale content.

#### Scenario: Fetch failure falls back to manual guidance

- **WHEN** the installer cannot obtain the source file contents (network failure or
  missing ref)
- **THEN** it stops with the documented manual steps and does not write partial files

### Requirement: Final summary

After completing, the installer SHALL print a summary stating what it did, what it
skipped (and why), and what the user must still verify or do manually — including the
GitHub App install it cannot confirm and the per-change usage entry point
(`/sfx:apply`).

#### Scenario: Summary reports actions and remaining steps

- **WHEN** the installer finishes
- **THEN** it prints a summary of written files, the secret, the ruleset outcome, and
  the manual items still owed by the user
