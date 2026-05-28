## 1. Slim the apply workflow

- [x] 1.1 Remove the "Resolve package manager" step (and its `id: pm`) from `.github/workflows/apply.yml`, including the fail-closed `exit 1` on missing `package.json`.
- [x] 1.2 Remove the "Enable pnpm via Corepack" and "Install bun" steps (and the `COREPACK_ENABLE_DOWNLOAD_PROMPT` env if no longer referenced).
- [x] 1.3 Remove the "Install workspace dependencies" step (`<pm> install --frozen-lockfile`).
- [x] 1.4 Keep `setup-node@v6` (node 24) and "Install Claude Code and OpenSpec CLIs"; confirm no remaining step references `steps.pm.outputs.name`.

## 2. Delegate setup to a sub-agent in the apply prompt

- [x] 2.1 Change the "Run /opsx:apply" `-p` prompt so the agent first provisions the project environment via a sub-agent (Task tool) reading native `CLAUDE.md`/`AGENTS.md`, then runs `/opsx:apply <name>`; instruct it to verify best-effort and to prefer stateless run invocations.
- [x] 2.2 Preserve the existing `claude` flags (`--dangerously-skip-permissions --model --effort --output-format stream-json --verbose`), the `tee`/`jq` streaming pipeline, `PIPESTATUS[0]` exit handling, and `continue-on-error`.
- [x] 2.3 Update the in-file header/comments to reflect technology-agnostic, agent-delegated, fail-open setup (remove the pnpm/bun precedence comments).

## 3. Documentation — README

- [x] 3.1 Replace the scope line ("pnpm- or bun-managed repos") with "any technology" wording in `README.md`.
- [x] 3.2 Add an adopter fine-tuning section: works out of the box on `ubuntu-latest`; guide setup via `CLAUDE.md`/`AGENTS.md`; include the known-gaps table (not-preinstalled toolchains, version mismatches, `corepack enable`, and the sub-agent shell-state caveat with stateless-invocation examples like `uv run pytest` / `.venv/bin/pytest` / `pnpm test`).

## 4. Documentation — HIGH-LEVEL-DESIGN

- [x] 4.1 Update the §3 architecture diagram ("install pnpm/bun" → agent-provisioned/tech-agnostic) and §4.3 reusable-workflow description.
- [x] 4.2 Update §5 prerequisites to drop "a pnpm- or bun-managed JS repo".
- [x] 4.3 Resolve open question §11.3 to record that the broadening was taken (subtraction + agent delegation), keeping OpenSpec as the one remaining hard prereq.

## 5. Verify

- [x] 5.1 `openspec validate tech-agnostic-apply` passes.
- [x] 5.2 Lint/parse the workflow YAML (e.g. `actionlint` if available, or a YAML parse) to confirm `apply.yml` is well-formed after edits.
- [x] 5.3 Sanity-check: grep `apply.yml` for residual `package.json`, `packageManager`, `pnpm`, `bun`, `corepack`, `frozen-lockfile`, and `steps.pm` references; none should remain outside historical comments.
