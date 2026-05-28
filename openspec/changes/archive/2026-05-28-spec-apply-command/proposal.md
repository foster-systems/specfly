## Why

Triggering a remote apply is the one step adopters still do by hand: on a
`change/<name>` branch, hand-craft a commit whose first line is `/spec:apply` and
push it (HIGH-LEVEL-DESIGN §7 step 2). It is easy to get wrong — wrong branch, a
subject that doesn't start with the marker, or a no-op re-push that silently
fails to re-dispatch. A single local command should do it for the user, the same
way `/opsx:propose` and `/opsx:apply` already wrap their local chores.

## What Changes

- Add a local Claude Code command **`/spec:apply [<name>] [model=<m>] [effort=<e>]`**
  that crafts the trigger commit and pushes it, so the backend dispatches the
  remote apply. It is a thin shim over `git` — the trigger contract is pure git
  and agent-agnostic, so no Claude-specific logic is involved.
- The command resolves the change name, ensures the `change/<name>` branch, makes
  an **empty** trigger commit (`--allow-empty`) so every run yields a fresh sha and
  re-dispatches, pushes without `--force`, then reports the
  webhook → dispatch → `Specfly[bot]` PR flow.
- Ship the command as **one committed file**, `.claude/commands/spec/apply.md`,
  copied into the adopter repo — the same delivery channel as the vendored
  `.claude/commands/opsx/*`, adding one file to the adopter footprint (mirrors the
  "one workflow file" model).
- Update adopter-facing docs (README setup, HIGH-LEVEL-DESIGN §7/§4.4) so the manual
  `git commit`/`push` becomes "run `/spec:apply`", and tick R9 on the roadmap.

Distinct from `/opsx:apply`, which implements a change's tasks **locally**;
`/spec:apply` instead triggers the **remote** apply run on the GitHub worker.

## Capabilities

### New Capabilities

- `apply-trigger-command`: the agent-side local command that produces a conformant
  apply trigger (the `change/<name>` branch + `/spec:apply` tip commit + push) and
  reports the downstream flow. The agent-agnostic git recipe it follows is the
  contract any future agent integration mirrors.

### Modified Capabilities

<!-- None. The backend trigger contract (apply-dispatch) is unchanged: the command
     conforms to it, so there is no spec-level requirement change there. -->

## Impact

- **New file** (specfly repo, source of truth + dogfooded): `.claude/commands/spec/apply.md`.
- **Docs**: `README.md` (Adopter setup), `openspec/_planning/HIGH-LEVEL-DESIGN.md`
  (§7 usage flow, §4.4 footprint), `openspec/_planning/.roadmap.md` (tick R9).
- **No backend / TypeScript changes**; no plugin/marketplace; no other-agent shims yet.
- Adopter footprint grows by exactly one committed file.
