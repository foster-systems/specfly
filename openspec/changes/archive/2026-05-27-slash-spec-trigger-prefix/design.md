## Context

The apply trigger is detected in the pure decision core `backend/src/logic.ts` by a
single constant `MARKER = "@spec:apply"`: `isTriggerCommit` checks whether the first
line (after trimming leading whitespace) `startsWith(MARKER)`, and `parseApplyArgs`
strips `MARKER` and reads trailing `key=value` tokens. Everything else that mentions
the marker — `apply.yml`, both READMEs, the example caller workflow, the
`github.ts`/`push.ts` comments, and four spec docs — is descriptive text, not logic.

R8 standardizes Specfly triggers on a slash-command convention, `/spec:<command>`, of
which `apply` is the only verb today. The change is small but cross-cutting (one code
constant, four spec deltas, doc/comment sweep), and it is a breaking change to the
trigger contract, so the decisions are worth recording.

## Goals / Non-Goals

**Goals:**

- Recognize `/spec:apply` as the apply trigger; stop recognizing `@spec:apply`.
- Parse the trigger as a `/spec:` namespace plus a command verb, so adding a second
  verb later is a small, localized change.
- Preserve every existing invariant: per-sha idempotency, the result-push and
  CI-refresh loop-prevention guarantees, and `model`/`effort` arg parsing.

**Non-Goals:**

- No second verb. Only `apply` is recognized; `/spec:verify`, `/spec:plan`, etc. are
  future work, not part of this change.
- No dual-accept / deprecation window for `@spec:apply` (see Decisions).
- No change to the dispatch payload, the runner workflow's behavior, or the result/
  CI-refresh commit subjects.

## Decisions

### Hard cutover, no dual-accept

The backend recognizes only `/spec:apply`. A commit starting with `@spec:apply` now
classifies as `ignore` (a silent no-op — no dispatch, no error).

*Why:* the App is not yet public (R4 pending) and the only adopters are
maintainer-controlled, so the migration cost is one habit change, not a fleet of
external users. Carrying both prefixes would mean extra branches and tests to later
remove. *Alternative considered:* accept both with `@spec:apply` deprecated — rejected
as needless code to add now and delete soon, with no real beneficiary.

### Namespace + verb parsing, not a literal string

Replace the `MARKER` literal with a `/spec:` namespace constant and verb extraction.
A new pure helper — `parseSpecCommand(line): string | null` — trims the first line's
leading whitespace, requires it to start with `/spec:`, and returns the first
whitespace-delimited token immediately after the namespace (or `null` if there is no
such token). `isTriggerCommit` becomes `parseSpecCommand(line) === "apply"`;
`parseApplyArgs` strips the namespace and the verb token, then parses the remaining
`key=value` tokens exactly as before. The recognized verb lives in one place, so a
future verb is a one-line addition to the recognized-command check.

*Alternative considered:* keep matching a literal `/spec:apply` string. Rejected
because the chosen convention is explicitly a `/spec:<command>` namespace; modeling the
verb as a discrete token is the structure that makes "add a verb later" cheap, and it
is barely more code.

### Verb is matched as a whole token (intentional tightening)

The old `startsWith("@spec:apply")` also matched `@spec:applyx` (a meaningless string)
as a trigger. The new parser extracts the verb as a whole token, so `/spec:applyx` is
the verb `applyx` → not recognized → not a trigger; likewise the bare `/spec:` and
`/spec: apply` (whitespace right after the colon) are not triggers. This is a
deliberate hardening of the contract, consistent with treating `/spec:` as a command
namespace. Matching stays case-sensitive, as today.

### Loop-prevention invariant is preserved by construction

The runner's result-commit subject (`opsx:apply <name>`) and the App's CI-refresh
subject (`chore: re-run CI`) do not start with `/spec:apply`, so they continue to
classify as `result` / `ignore` respectively. No subject needs to change; the
invariant "neither the result push nor the CI-refresh push can re-trigger" holds
unchanged under the new prefix.

## Risks / Trade-offs

- **A pushed `@spec:apply` after cutover silently does nothing** → acceptable and
  intended: it classifies as `ignore`, so there is no loop and no half-run, just no
  PR. The fix is to re-push with `/spec:apply`. Documented in the READMEs.
- **In-flight habit / muscle memory still types `@spec:apply`** → mitigated by the
  README/example updates in this change and, soon, the R9 "apply remotely" skill that
  crafts the trigger commit so the prefix is never hand-typed.
- **Tightening to whole-token verb matching changes behavior for `@spec:applyx`-style
  inputs** → no real input relied on the loose prefix match; the tightening only
  removes nonsensical matches and is captured in the spec scenarios.
