## ADDED Requirements

### Requirement: Provision the project environment without assuming a package manager

The reusable apply workflow (`.github/workflows/apply.yml`) SHALL NOT require a
`package.json`, SHALL NOT resolve or install an adopter-specific package manager,
and SHALL NOT fail when no recognized package manager is present. The
package-manager resolution, pnpm/bun provisioning, and `<pm> install
--frozen-lockfile` steps SHALL be removed, so the workflow makes no assumption
about the adopter's language or toolchain.

The workflow SHALL retain the Node setup and the global install of
`@anthropic-ai/claude-code` and `@fission-ai/openspec` — these are Specfly's own
runtime, required regardless of the adopter's stack — and SHALL retain checkout,
`openspec validate` (which uses Specfly's own OpenSpec CLI, not adopter
dependencies), commit/push, outcome reporting, and log upload unchanged.

#### Scenario: Non-Node repository runs instead of failing closed

- **WHEN** the workflow runs on an adopter repository that has no `package.json`
  (e.g. a Python, Rust, Go, or Ruby project)
- **THEN** the workflow does not exit early with an error about a missing
  `package.json` or unsupported package manager, and proceeds to run `/opsx:apply`

#### Scenario: Node repository still works without explicit provisioning

- **WHEN** the workflow runs on a pnpm- or bun-managed repository that previously
  relied on the removed provisioning steps
- **THEN** the workflow still checks out, runs `/opsx:apply`, validates, and pushes
  the result branch; the adopter's caller workflow needs no change

#### Scenario: Specfly's own CLIs remain available

- **WHEN** the workflow prepares to run the agent
- **THEN** Node is set up and `@anthropic-ai/claude-code` and `@fission-ai/openspec`
  are installed globally, so `claude` and `openspec validate` run regardless of the
  adopter's stack

### Requirement: Delegate project environment setup to the agent via a sub-agent

The "Run /opsx:apply" step's prompt SHALL instruct the agent to first provision the
project environment using a sub-agent (the Task tool) and then run
`/opsx:apply <name>`. The sub-agent SHALL take its guidance from the repository's
native `CLAUDE.md` / `AGENTS.md` (which Claude Code auto-loads) rather than from a
Specfly-specific convention file. Setup SHALL be best-effort and fail-open: if the
environment cannot be fully provisioned, the agent SHALL still apply the change,
and the branch SHALL still be pushed for human review (consistent with the existing
`continue-on-error` posture). The change SHALL NOT introduce a new adopter
convention file dedicated to setup.

#### Scenario: Setup runs before apply via a sub-agent

- **WHEN** the "Run /opsx:apply" step invokes `claude`
- **THEN** the prompt directs the agent to provision the project environment in a
  sub-agent before running `/opsx:apply <name>`, keeping setup output out of the
  main agent's context

#### Scenario: Setup guidance comes from native repo files

- **WHEN** the adopter documents environment setup (e.g. which package manager,
  toolchain version, or run commands) in `CLAUDE.md` or `AGENTS.md`, optionally
  referencing further `.md` files
- **THEN** the setup sub-agent uses that guidance, and no Specfly-specific setup
  convention file is required

#### Scenario: Failed setup still produces a reviewable PR

- **WHEN** the environment cannot be fully provisioned (e.g. an exotic or
  version-pinned toolchain the runner lacks)
- **THEN** the agent still applies what it can, the result branch is pushed, and the
  human reviews the PR (the adopter's CI re-validates) — the run does not fail
  closed before applying
