<div align="center">

# Specfly

**Push a change *proposal*, get a reviewable pull request with its implementation.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Powered by Claude Code](https://img.shields.io/badge/powered%20by-Claude%20Code-6f42c1.svg)](https://claude.com/claude-code)

</div>

Specfly is a [Spec-Driven Development](https://specdriven.com/) tooling. It builds on awesome [OpenSpec](https://github.com/Fission-AI/OpenSpec) to make coding with LLMs efficient, sustainable, and secure.

## Why Specfly

- **🛡️ Safe unattended runs.** The agent runs in an ephemeral, isolated GitHub Actions environment. 
- **💸 Cost control.** Bring your own Anthropic key and run on your Github runner.
- **🧩 Open and composable.** Supports **any** popular tech stack and drops into bigger workflows cleanly.
- **🥇Best practices.** Stay efficient in the long run with spec-driven advantage.

## How it works

1. Create a new change proposal with `/opsx:propose` Claude Code command - it will produce spec files for you.
2. Review the change proposal files locally - it should accurately describe what you want to achieve with your change; prompt any changes that you think are needed.
3. Trigger the change implementation with `/sfx:apply [<change-name>]` - it is using your Github Actions worker.
4. Review & test the implementation PR; prompt any changes that you think are needed, and you can *apply* them again.
5. Archive the change with `/opsx:archive`, commit & push, approve and merge the PR.
6. Repeat.

## Get started

From inside a clone of your GitHub repo (with an authenticated [`gh`](https://cli.github.com) and `git`):

```bash
curl -fsSL https://specfly.dev/install.sh | bash
```

The installer does the mechanical setup (caller workflow, `/sfx:apply` command file,
`ANTHROPIC_API_KEY` secret, optional `main` ruleset) and walks you through the
browser-only steps (OpenSpec init, GitHub App install, API-key creation). It is safe
to re-run.

<details>
<summary>Prefer to do it by hand? The manual steps</summary>

1. **Install [OpenSpec](https://github.com/Fission-AI/OpenSpec)** - the spec-driven development framework.
1. **Install the Specfly App** at [`github.com/apps/specfly`](https://github.com/apps/specfly) - pick your repos.
1. **Add one secret** — `ANTHROPIC_API_KEY` - your own key.
1. **Add one caller workflow** — see [`examples/adopter-workflow.yml`](examples/adopter-workflow.yml).
1. **Copy one command file** — `.claude/commands/sfx/apply.md`; then `/sfx:apply [<change-name>]` triggers an apply.
1. **(Recommended) Protect `main`** — require a PR + 1 approval, block direct pushes: [Protecting `main`](docs/protect-main.md).

</details>

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
