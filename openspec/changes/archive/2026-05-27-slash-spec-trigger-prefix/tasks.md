## 1. Decision core (`backend/src/logic.ts`)

- [x] 1.1 Replace `const MARKER = "@spec:apply"` with a `/spec:` namespace constant (e.g. `NAMESPACE = "/spec:"`) and the recognized verb `apply`.
- [x] 1.2 Add a pure helper `parseSpecCommand(line): string | null` that trims the first line's leading whitespace, requires it to start with `NAMESPACE`, and returns the first whitespace-delimited token immediately after the namespace (or `null` when that token is empty).
- [x] 1.3 Reimplement `isTriggerCommit` as `parseSpecCommand(line) === "apply"` (case-sensitive whole-token match; `/spec:applyx`, `/spec:foo`, bare `/spec:`, and `/spec: apply` are not triggers).
- [x] 1.4 Update `parseApplyArgs` to strip the namespace and the verb token before parsing the remaining `key=value` tokens (`model`/`effort` semantics unchanged).
- [x] 1.5 Update the `classifyPush` doc comment (the `@spec:apply` mentions) to the new prefix.

## 2. Tests (`backend/test/logic.test.ts`)

- [x] 2.1 Update existing `isTriggerCommit` cases to `/spec:apply` (plain, with args, leading-whitespace, multiline; marker only in body stays false).
- [x] 2.2 Add `isTriggerCommit` cases proving the tightening: bare `/spec:`, `/spec: apply`, `/spec:foo`, and `/spec:applyx` are false; legacy `@spec:apply` is false.
- [x] 2.3 Update `parseApplyArgs` cases to the `/spec:apply …` prefix (known args, unknown ignored, empty value, no args).
- [x] 2.4 Update `classifyPush` cases (`subject` fixtures) to `/spec:apply`.
- [x] 2.5 Run the backend test suite and confirm green.

## 3. Docs & comments

- [x] 3.1 `README.md` — update the trigger line (`push a commit "@spec:apply…"`).
- [x] 3.2 `backend/README.md` — update every `@spec:apply` reference (trigger definition, payload comment, the `opsx:apply` result-subject note, the concurrency paragraph, and the recovery paragraph).
- [x] 3.3 `examples/adopter-workflow.yml` — update the `@spec:apply` comment.
- [x] 3.4 `backend/src/github.ts` and `backend/src/handlers/push.ts` — update the `@spec:apply` comments.
- [x] 3.5 `.github/workflows/apply.yml` — update the header comments and the rejected-push `::error::` message that say "re-trigger @spec:apply".

## 4. Validate

- [x] 4.1 `openspec validate slash-spec-trigger-prefix --strict` passes.
- [x] 4.2 Confirm no stray `@spec:apply` remains in code, tests, docs, or workflows (grep), excluding `openspec/changes/archive/` and `openspec/_planning/` history. (Remaining hits are the intentional legacy-rejection tests and the main specs, which the deltas update at archive.)
