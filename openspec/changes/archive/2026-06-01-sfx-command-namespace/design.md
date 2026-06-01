## Context

R8 standardized Specfly triggers on a slash-command convention, `/spec:<command>`, of
which `apply` is the only verb today. The apply trigger is detected in the pure
decision core `backend/src/logic.ts` by a `NAMESPACE = "/spec:"` constant plus verb
extraction: `parseSpecCommand` trims the first line, requires it to start with the
namespace, and returns the first token after it; `isTriggerCommit` is
`parseSpecCommand(line) === "apply"`; and `parseApplyArgs` strips the namespace and
verb before reading trailing `key=value` tokens. The same `/spec:apply` literal is the
public trigger contract (the tip-commit subject) and the name of the local Claude Code
command at `.claude/commands/spec/apply.md` that crafts and pushes that subject.

R11 changes only the namespace literal — `/spec:` → `/sfx:` — to make the marker
Specfly-specific and reduce collisions with the generic word "spec". The change is
small but cross-cutting (one code constant, a renamed command directory, five spec
deltas, a doc/comment sweep) and is breaking to the trigger contract, so the decisions
are worth recording. It is the direct analogue of R8 (which moved `@spec:apply` →
`/spec:apply`); the same reasoning and invariants carry over.

## Goals / Non-Goals

**Goals:**

- Recognize `/sfx:apply` as the apply trigger; stop recognizing `/spec:apply`.
- Rename the local command `/spec:apply` → `/sfx:apply` (directory + skill metadata +
  the trigger subject it crafts) so the command and the contract stay in lockstep.
- Preserve the namespace-plus-verb structure so adding a second verb later stays a
  localized change.
- Preserve every existing invariant: per-sha idempotency, the result-push and
  CI-refresh loop-prevention guarantees, and `model`/`effort` arg parsing.

**Non-Goals:**

- No second verb. Only `apply` is recognized; `/sfx:verify`, `/sfx:plan`, etc. are
  future work.
- No dual-accept / deprecation window for `/spec:apply` (see Decisions).
- No change to the dispatch payload, the runner workflow's behavior, the result-commit
  subject (`opsx:apply <name>`), or the CI-refresh subject.
- The `/opsx:` namespace (OpenSpec's own commands) is unrelated and unchanged.

## Decisions

### Hard cutover, no dual-accept

The backend recognizes only `/sfx:apply`. A commit starting with `/spec:apply` now
classifies as `ignore` (a silent no-op — no dispatch, no error).

*Why:* the App is not yet public (R4 pending) and the only adopters are
maintainer-controlled, so the migration cost is one habit change, not a fleet of
external users — and the R9 `/sfx:apply` command crafts the trigger subject, so the
namespace is rarely hand-typed. Carrying both prefixes would mean extra branches and
tests to later remove. *Alternative considered:* accept both with `/spec:apply`
deprecated — rejected as needless code to add now and delete soon, with no real
beneficiary. This mirrors R8's identical cutover decision.

### Change only the namespace literal; keep the verb-parsing structure

The decision core already models the trigger as a `<namespace>` + `<verb>` pair. R11
changes only the `NAMESPACE` constant from `/spec:` to `/sfx:`; `parseSpecCommand`,
`isTriggerCommit`, and `parseApplyArgs` keep their shape. The helper is renamed
`parseSpecCommand` → `parseSfxCommand` for consistency with the new namespace (a pure
rename with no behavior change). Whole-token, case-sensitive verb matching is retained,
so `/sfx:applyx`, `/sfx:foo`, the bare `/sfx:`, and `/sfx: apply` are not triggers.

*Alternative considered:* leave the helper name as `parseSpecCommand`. Rejected — the
"spec" in the name would be a stale reference to the old namespace and mislead future
readers; the rename is mechanical and confined to `logic.ts` + its tests.

### The local command and the contract move together

`.claude/commands/spec/apply.md` becomes `.claude/commands/sfx/apply.md` (the directory
segment is the command namespace, so the move is what renames `/spec:apply` →
`/sfx:apply`). Its skill `name`/`description`, usage line, worked examples, output
block, guardrails, and — critically — the `git commit -m "/sfx:apply <name>"` recipe it
follows all switch to `/sfx:`. Keeping the command and the backend contract in lockstep
preserves the "agent-agnostic trigger recipe" property: the command still encodes
exactly the public contract (`change/<name>` branch + `/sfx:apply` first-line tip
commit + push).

### Loop-prevention invariant is preserved by construction

The runner's result-commit subject (`opsx:apply <name>`) and the App's CI-refresh
subject (`chore: re-run CI`) do not start with `/sfx:apply`, so they continue to
classify as `result` / `ignore` respectively. No subject needs to change; the
invariant "neither the result push nor the CI-refresh push can re-trigger" holds
unchanged under the new namespace.

## Risks / Trade-offs

- **A pushed `/spec:apply` after cutover silently does nothing** → acceptable and
  intended: it classifies as `ignore`, so there is no loop and no half-run, just no PR.
  The fix is to re-push with `/sfx:apply`. Documented in the READMEs. Mitigated further
  because the renamed `/sfx:apply` command crafts the subject, so it is rarely typed by
  hand.
- **Muscle memory / stale references still type or document `/spec:apply`** → mitigated
  by sweeping the READMEs, the example workflow, the workflow/source comments, and the
  spec docs in this change, plus a grep guard in the tasks confirming no stray
  `/spec:apply` remains outside the intentional legacy-rejection tests.
- **The command directory move could orphan the old path** → mitigated by deleting
  `.claude/commands/spec/apply.md` (and the now-empty `spec/` directory) as part of the
  rename, verified by the tasks.

## Migration Plan

1. Land the code + command rename together so the contract and the local command never
   diverge.
2. Deploy the backend (`wrangler deploy`) so the worker recognizes `/sfx:apply`. Until
   deployed, in-flight `/spec:apply` triggers still work; after deploy, only
   `/sfx:apply` does. There is no DB migration — the change is pure parsing logic.
3. Rollback is reverting this change (restores `/spec:` recognition and the old command
   path); no state migration is involved.
