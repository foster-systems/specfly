<div align="center">

# Specfly

**Push an OpenSpec change, get a reviewable pull request — from a GitHub-hosted Claude Code run.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Powered by Claude Code](https://img.shields.io/badge/powered%20by-Claude%20Code-6f42c1.svg)](https://claude.com/claude-code)

</div>

> **Status: early development.** The architecture is settled (see the
> [design overview](docs/design.md)) and this repo is being built in the open.
> Not yet ready for general adoption.

Specfly runs Claude Code's `/opsx:apply` on *your own* GitHub Actions runner and
opens a PR for your review — no laptop tether, and almost no setup. It's the
successor to [remcc](https://github.com/foster-systems/remcc), redesigned to make
adoption a few clicks instead of a custom GitHub App per repo.

## Why Specfly

- **🛡️ Safe unattended runs.** The agent runs in an ephemeral, isolated GitHub
  Actions environment on a single-repo token that expires with the job. A `main`
  branch ruleset *you* own — not any token's scope — is what fences unreviewed
  code off `main`, and the PR lands as `Specfly[bot]` so you review every change
  before it merges.
- **💸 Cost control.** Bring your own Anthropic key — no token reselling, no
  billing, no custody of your source or compute. It all stays in your runner on
  your key, and the hosted backend is a webhook router with near-zero maintainer
  cost.
- **🧩 Composable.** It's just Claude Code + GitHub Actions + OpenSpec
  `/opsx:apply` on a repo of **any** technology (Python, Rust, Go, Ruby, JVM, JS,
  …). The agent provisions its own environment, so there's nothing to declare and
  it drops into bigger workflows cleanly.

## How it works

A hosted **control plane** (a GitHub App + a tiny backend) dispatches work into
*your* **data plane** (your Actions runner). The expensive part — cloning and
running Claude Code — happens in your Actions on your Anthropic key. Specfly only
routes the trigger and authors the PR.

```
  push a commit "/sfx:apply…" on change/<name>  →  Specfly App (push webhook)
     →  repository_dispatch  →  your runner runs /opsx:apply + pushes the result
     →  Specfly[bot] opens the PR (once apply completes)  →  you review, approve, merge
```

Because the PR is authored by `Specfly[bot]` (a separate actor), you can approve
it yourself and your CI still triggers. See the
[design overview](docs/design.md) for the full architecture and security model.

## Get started

1. **Install the Specfly App** at [`github.com/apps/specfly`](https://github.com/apps/specfly) (pick your repos).
2. **Add one secret** — `ANTHROPIC_API_KEY` (bring your own key).
3. **Add one caller workflow** — see [`examples/adopter-workflow.yml`](examples/adopter-workflow.yml).
4. **Copy one command file** — `.claude/commands/sfx/apply.md`; then `/sfx:apply [<name>]` triggers an apply.
5. **(Recommended) Protect `main`** — require a PR + 1 approval, block direct pushes: [Protecting `main`](docs/protect-main.md).

Full walkthrough, the per-change usage flow, and how to
[fine-tune for your stack](docs/fine-tuning.md) are in
**[Getting started](docs/getting-started.md)**.

## Documentation

- **[Design overview](docs/design.md)** — how Specfly is built and why.
- **[Getting started](docs/getting-started.md)** — full adopter setup and usage flow.
- **[Fine-tuning for your stack](docs/fine-tuning.md)** — environment provisioning on any toolchain.
- **[Protecting `main`](docs/protect-main.md)** — the branch ruleset that keeps unreviewed code off `main`.
- **[Backend reference](backend/README.md)** — control-plane engineering reference.

See the [documentation index](docs/README.md) for the full map.

## License

[MIT](LICENSE) © Foster Systems
