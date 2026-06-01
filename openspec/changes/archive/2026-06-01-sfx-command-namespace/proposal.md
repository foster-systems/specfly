## Why

The Specfly command namespace `/spec:` is generic — "spec" is a common word that
other tooling (editors, CI bots, other agent frameworks) may already claim, so a
`/spec:apply` commit subject or slash command risks colliding with an unrelated
trigger. Renaming to the Specfly-specific `/sfx:` namespace lowers that collision
risk. Switching now, before the GitHub App goes public (R4), avoids imposing a
breaking trigger change on outside adopters later.

## What Changes

- **BREAKING**: the command/trigger namespace changes from `/spec:` to `/sfx:`, so
  the apply trigger becomes `/sfx:apply`. The backend recognizes only the new
  namespace; a commit whose subject starts with `/spec:apply` is no longer a trigger
  and classifies as `ignore` (a silent no-op). Hard cutover — no dual-accept window.
- The local Claude Code command is renamed `/spec:apply` → `/sfx:apply`: the command
  file moves from `.claude/commands/spec/apply.md` to `.claude/commands/sfx/apply.md`
  (the directory name is the namespace), and its skill name/description/examples and
  the trigger subject it crafts switch to `/sfx:apply`.
- The decision core keeps its namespace-plus-verb structure (only the literal
  namespace changes); `apply` remains the only recognized verb, and the bare
  namespace (`/sfx:`) and unknown verbs (`/sfx:foo`) are not triggers.
- `key=value` apply args (`model`, `effort`) are parsed after `/sfx:apply` instead of
  `/spec:apply`; their semantics are unchanged.
- The runner's result-commit subject (`opsx:apply <name>`) and the App's CI-refresh
  subject (`chore: re-run CI`) still do not start with `/sfx:apply`, so the
  loop-prevention invariant holds unchanged.
- Update unit tests, the affected spec docs, both READMEs, the example workflow, and
  code/workflow comments to the new namespace.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `apply-dispatch`: the trigger marker becomes the `/sfx:` command namespace. Push
  classification, trigger-detection criteria, command-verb recognition, and
  apply-argument parsing reference `/sfx:apply` instead of `/spec:apply`.
- `apply-trigger-command`: the local command becomes `/sfx:apply` (file at
  `.claude/commands/sfx/apply.md`); every requirement and scenario that names the
  command, the crafted trigger subject, or the override hint switches to `/sfx:`.
- `apply-concurrency`: the coalescing requirement and scenarios reference `/sfx:apply`
  triggers instead of `/spec:apply`.
- `apply-runner`: the result-commit invariant requires the subject to not start with
  `/sfx:apply` (was `/spec:apply`).
- `pr-authoring`: the human-push and result-push requirements reference the
  `/sfx:apply` marker instead of `/spec:apply`.

## Impact

- **Functional code**: `backend/src/logic.ts` — the only behavior change (the
  `NAMESPACE` literal `/spec:` → `/sfx:`; the `parseSpecCommand` helper is renamed for
  consistency).
- **Local command**: `.claude/commands/spec/apply.md` → `.claude/commands/sfx/apply.md`
  (renamed dir + updated skill name, description, usage, and crafted subject).
- **Tests**: `backend/test/logic.test.ts`.
- **Specs**: `apply-dispatch`, `apply-trigger-command`, `apply-concurrency`,
  `apply-runner`, `pr-authoring`.
- **Docs & comments**: `README.md`, `backend/README.md`, `examples/`, comments in
  `backend/src/github.ts` and `backend/src/handlers/push.ts`, and the comments plus
  the rejected-push `::error::` text in `.github/workflows/apply.yml`.
- **Adopters**: anyone pushing `/spec:apply` must switch to `/sfx:apply`. Acceptable
  now (pre-public); it becomes a migration burden if deferred past R4.
