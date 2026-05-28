## Context

Specfly's reusable workflow `.github/workflows/apply.yml` currently provisions a
JavaScript toolchain before running the agent: it resolves a package manager from
`package.json#packageManager` (or a bun lockfile), provisions pnpm/bun, and runs
`<pm> install --frozen-lockfile`. The "Resolve package manager" step exits `1`
when there is no `package.json` or no recognized manager, so any non-Node repo is
rejected before `/opsx:apply` runs.

The control plane is already agnostic to all of this. The GitHub App matches a
commit-subject prefix and fires `repository_dispatch`; the backend opens the PR on
any result push to `change/<name>`. Neither reads the adopter's manifest. Open
question §11.3 of `HIGH-LEVEL-DESIGN.md` recorded this and pre-approved broadening
as "additive and localized" to `apply.yml` — never a control-plane change. This
change takes that path.

Two distinct uses of "Node" live in `apply.yml` and must not be conflated:

- **(A) Specfly's own runtime** — `@anthropic-ai/claude-code` and
  `@fission-ai/openspec` ship as npm packages, so Specfly needs Node to run
  *itself* regardless of the adopter's stack. This stays.
- **(B) the adopter's project stack** — resolving/installing the adopter's package
  manager and dependencies. This is the only coupling, and it is what we remove.

The (B) steps are an optimization, not a requirement: they let the agent start in a
ready-to-test repo (in-loop verification) and give a reproducible install. The
agent runs with `--dangerously-skip-permissions` (full shell) and can provision its
own environment, and the PR is reviewed by a human whose CI re-validates — so (B)
is a speed/quality lever, not load-bearing.

## Goals / Non-Goals

**Goals:**
- `/spec:apply` runs on any technology (Python, Rust, Go, Ruby, JVM, …) and on any
  Node package manager (npm, yarn, pnpm, bun) without per-stack workflow logic.
- "Just works" out of the box for mainstream stacks; optional fine-tuning for the
  long tail.
- No control-plane change, no new App permissions, no new adopter secrets, no
  change to the adopter's caller workflow.
- Keep `apply.yml` lean and readable (the "transparent workflow" goal).

**Non-Goals:**
- A per-language detection/provisioning matrix in `apply.yml`.
- A new adopter convention file (e.g. `setup.md`). Guidance reuses native
  `CLAUDE.md` / `AGENTS.md`.
- Guaranteeing a reproducible (frozen-lockfile) install. Specfly is already
  non-deterministic (it is an LLM run); reproducibility is not a product promise.
- Solving private registries / service dependencies / pinned-toolchain provisioning
  in the workflow. These are the adopter's to document in `CLAUDE.md`.

## Decisions

### D1 — Generalize by subtraction, not by a detection matrix

Remove the three (B) steps outright rather than growing them to cover npm/yarn and
other ecosystems.

- **Why:** A `{language} × {package manager} × {version}` matrix bloats `apply.yml`
  into hundreds of lines and must be maintained forever — directly against the
  "adopters can read exactly what runs" goal. Subtraction makes the workflow
  *smaller* while making it *more* general.
- **Alternatives considered:**
  - *Broaden the matrix* (add npm/yarn/python/rust cases): zero-config and
    deterministic, but unbounded maintenance and YAML bloat.
  - *`.specfly/setup.sh` hook*: lean, but a brittle executable that must `exit 0`,
    and a new adopter convention.
  - *Honor `mise`/`devcontainer.json`*: elegant where present, but still workflow
    logic and assumes the adopter already standardized.
  - Subtraction + agent delegation subsumes the best of these without the
    maintenance surface.

### D2 — Keep Node and Specfly's CLIs; remove only the adopter-stack steps

Retain `setup-node@24` and `npm install -g @anthropic-ai/claude-code
@fission-ai/openspec`. Remove "Resolve package manager", "Enable pnpm via
Corepack" / "Install bun", and "Install workspace dependencies".

- **Why:** Conflating (A) and (B) is the trap. (A) is Specfly's engine; (B) is the
  payload's environment. Only (B) is coupling. A useful side effect: Node adopters
  still get a Node runtime for free, and `ubuntu-latest` already ships Python, Go,
  Rust, Ruby, JVM, gcc/clang, Docker, etc. — so for mainstream stacks the toolchain
  is already present and the agent only installs *dependencies*.

### D3 — Delegate setup to the agent via a sub-agent, guided by native CLAUDE.md

Change the "Run /opsx:apply" prompt from `/opsx:apply <name>` to instruct the agent
to first provision the project environment **using a sub-agent (Task tool)**, then
run `/opsx:apply <name>`. The sub-agent reads the repo's native `CLAUDE.md` /
`AGENTS.md` (auto-loaded by Claude Code), which may reference further `.md` files.

- **Why a sub-agent:** Environment setup is noisy — a dependency install can dump
  hundreds of lines, plus any toolchain debugging. Running it in a sub-agent keeps
  that output in the sub-agent's context and returns only a short summary, so the
  main agent preserves its budget for the actual apply.
- **Why native CLAUDE.md/AGENTS.md, not a new file:** Claude Code auto-reads them
  with zero wiring, well-run repos already have them, and adding `setup.md` would
  invent a convention against the "almost no setup" ethos. CLAUDE.md is the
  *guidance source*; the apply prompt is the *trigger* that makes setup happen.
- **Alternative considered:** a dedicated `setup.md` named in the prompt — rejected
  as a new convention that is not auto-read and fragments guidance.

### D4 — Best-effort and fail-open

If setup cannot complete, the agent proceeds with the apply, the branch is pushed,
and the human reviews the PR. This matches the existing `continue-on-error` posture
on the apply and validate steps.

- **Why:** The merge gate is the human + the adopter's CI on the PR, not the
  runner. A barer environment degrades *quality* (less in-loop verification), never
  *function* (the apply→push→PR loop still completes).

## Risks / Trade-offs

- **Per-run setup cost (tokens + wall-clock).** The agent now spends early budget on
  `install` every run, on repos that previously got it free. → *Mitigation:*
  sub-agent isolation caps the context cost; the fat runner means it is usually
  `pnpm install` / `uv sync`, not a full toolchain build.
- **Weaker in-loop verification.** A "best-effort" agent might skip tests it cannot
  set up and still push. → *Mitigation:* the apply prompt explicitly asks the agent
  to verify; the PR is human-reviewed and the adopter's CI re-runs. The R7 logging
  surfaces setup attempts as summarized `Bash`/`Task` lines in `apply.log`.
- **Sub-agent persists filesystem, not shell state.** A setup sub-agent's
  `node_modules`/`.venv` survive on disk, but venv activation, exported vars, and
  PATH tweaks do not cross back to the main agent (every Bash call is a fresh
  shell). → *Mitigation:* document in `README.md` that `CLAUDE.md` should prefer
  stateless invocations (`uv run pytest`, `.venv/bin/pytest`, `pnpm test`), and have
  the sub-agent report the run recipe in its summary.
- **Toolchain gaps for the long tail.** Bun/Deno/Zig/Elixir are not preinstalled;
  pinned versions sit unselected in the tool cache; pnpm needs `corepack enable`. →
  *Mitigation:* the agent installs what is missing; the README fine-tuning section
  documents these gaps so adopters can guide it in `CLAUDE.md`.
- **Loss of frozen-lockfile determinism.** → *Accepted:* Specfly is already an LLM
  run; reproducibility was never a guarantee.

## Migration Plan

- The change is backward compatible for adopters: they pin `apply.yml@v1` and pass
  the same inputs; no caller edit is required. Existing Node adopters keep working
  (the agent provisions what the removed steps used to). Moving the `v1` tag is
  acceptable while Specfly is pre-adoption ("early development").
- **Rollback:** revert `apply.yml` to restore the (B) steps; no data or state to
  migrate.

## Open Questions

- **Keep a fast-path for recognized Node lockfiles?** A tiny optional pre-install
  for `pnpm-lock.yaml`/`bun.lock` would restore speed/determinism for the common
  case at the cost of reintroducing a sliver of the matrix. Resolved for now in
  favor of the purist single-rule design (no detection); revisit if Node-adopter
  apply latency proves a problem.
- **Tag strategy** — move `v1` in place (backward compatible, chosen) vs. cut `v2`.
  Maintainer's call at release time; not blocking.
