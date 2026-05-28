## Why

Specfly only runs on pnpm- or bun-managed JavaScript repos. The reusable apply
workflow hard-fails with `exit 1` when there is no `package.json`, so a Python,
Rust, Go, or Ruby adopter cannot use `/spec:apply` at all — the run dies before
the agent starts. Yet the control plane (App + backend) is already
technology-agnostic; the coupling lives entirely in three steps of
`.github/workflows/apply.yml`. Those steps are an optimization (in-loop
verification + frozen-lockfile determinism), not a load-bearing requirement: the
agent runs with full shell access and can provision its own environment. We can
make `/spec:apply` work on any stack by *subtraction*.

## What Changes

- **Stop resolving and installing the adopter's package manager.** Remove the
  "Resolve package manager", "Enable pnpm via Corepack" / "Install bun", and
  "Install workspace dependencies" steps from `apply.yml`. **BREAKING** for the
  workflow's internal contract — but additive for adopters: repos that worked
  keep working, and non-Node repos now run instead of failing closed.
- **Delegate environment setup to the agent.** Change the "Run /opsx:apply" step's
  prompt so the agent first provisions the project environment via a **sub-agent**
  (keeping noisy install output out of the main context window), then runs
  `/opsx:apply <name>`. The sub-agent takes its guidance from the repo's native
  `CLAUDE.md` / `AGENTS.md` (which Claude Code auto-reads), which may reference
  further `.md` files. No new convention file is introduced.
- **Keep Node for Specfly's own runtime.** `setup-node` and the global install of
  `@anthropic-ai/claude-code` + `@fission-ai/openspec` stay — Node is how Specfly
  runs *itself*, independent of the adopter's stack. Checkout, `openspec validate`,
  commit/push, reporting, and log upload are unchanged.
- **Fail open, not closed.** If setup cannot complete, the agent still applies what
  it can, pushes the branch, and the human reviews the PR (the adopter's CI
  re-validates) — matching the existing `continue-on-error` posture.
- **Document the new contract for adopters.** Update `README.md` (scope line +
  a fine-tuning section with the known-gaps table) and
  `openspec/_planning/HIGH-LEVEL-DESIGN.md` (§3 diagram, §4.3, §5 prerequisites,
  and resolve open question §11.3).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `apply-runner`: drop the package-manager-specific environment provisioning and
  replace it with technology-agnostic, agent-delegated, best-effort setup. The
  workflow no longer requires `package.json` and no longer fails when a recognized
  package manager is absent.

## Impact

- **`.github/workflows/apply.yml`** — remove three steps; change the apply prompt
  to a setup-first, sub-agent invocation. `setup-node` + CLI install retained.
- **`README.md`** — scope language ("pnpm- or bun-managed repos" → any technology)
  and a new adopter fine-tuning section.
- **`openspec/_planning/HIGH-LEVEL-DESIGN.md`** — §3, §4.3, §5, §11.3.
- **App, backend, trigger mechanism, concurrency guard, PR-open handshake** —
  untouched. No control-plane change, no new permissions, no new secrets.
- Adopter footprint is unchanged (still: install App, one secret, one caller
  workflow). Fine-tuning via `CLAUDE.md` is optional.
