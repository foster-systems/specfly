# Fine-tuning Specfly for your stack

Specfly runs the agent on a stock `ubuntu-latest` runner, which already ships
Python, Go, Rust, Ruby, the JVM, Node, `gcc`/`clang`, and Docker. Before applying
a change, the agent provisions your project's environment itself (in a sub-agent,
to keep noisy install output out of its main context), taking its cues from your
repo's native `CLAUDE.md` / `AGENTS.md` — the same files Claude Code already reads.

For mainstream stacks this works out of the box; no Specfly-specific config file
exists or is needed. Setup is **best-effort and fail-open**: if it can't fully
provision, the agent still applies what it can and pushes the branch for your
review (your CI re-validates the PR).

## Helping the agent on the long tail

To help the agent with less common setups, document them in `CLAUDE.md` /
`AGENTS.md`:

| Gap | What happens | Guide the agent to… |
| --- | --- | --- |
| **Toolchain not preinstalled** (Bun, Deno, Zig, Elixir, …) | The runner image doesn't ship it | Note the install command (e.g. `curl -fsSL https://bun.sh/install \| bash`) |
| **Version mismatch** (need a specific Node/Python/… not the default) | A pinned toolchain may sit unselected in the runner's tool cache | Name the version and how to select it (e.g. via `mise`, `nvm`, `pyenv`) |
| **pnpm via Corepack** | `pnpm` isn't on `PATH` until enabled | Mention `corepack enable` (then `pnpm install`) |
| **Shell state doesn't persist** | Each agent `Bash` call is a fresh shell — activated venvs, exported vars, and `PATH` edits don't carry over | Prefer **stateless** run commands: `uv run pytest`, `.venv/bin/pytest`, `pnpm test` |
