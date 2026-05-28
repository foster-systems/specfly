## 1. Decision core (`backend/src/logic.ts`)

- [ ] 1.1 Change `const NAMESPACE = "/spec:"` to `"/sfx:"` (the only behavior change; `APPLY_COMMAND = "apply"` is unchanged).
- [ ] 1.2 Rename the helper `parseSpecCommand` → `parseSfxCommand` and update its doc comment (the `/spec:` mentions) to `/sfx:`; the logic is unchanged.
- [ ] 1.3 Update every internal caller of the renamed helper (`isTriggerCommit`, `parseApplyArgs`) and their doc comments to `/sfx:`.
- [ ] 1.4 Update the `classifyPush` doc comment (the `/spec:apply` mentions) to `/sfx:apply`.

## 2. Tests (`backend/test/logic.test.ts`)

- [ ] 2.1 Update existing `isTriggerCommit` cases to `/sfx:apply` (plain, with args, leading-whitespace, multiline; marker only in body stays false).
- [ ] 2.2 Update the tightening cases to the new namespace: bare `/sfx:`, `/sfx: apply`, `/sfx:foo`, and `/sfx:applyx` are false.
- [ ] 2.3 Update the legacy-rejection case to assert the **new** legacy prefix `/spec:apply` is false (replacing the old `@spec:apply` assertion).
- [ ] 2.4 Update `parseApplyArgs` cases to the `/sfx:apply …` prefix (known args, unknown ignored, empty value, no args).
- [ ] 2.5 Update `classifyPush` cases (`subject` fixtures) to `/sfx:apply`, and rename any test references to the helper (`parseSpecCommand` → `parseSfxCommand`).
- [ ] 2.6 Run the backend test suite and confirm green.

## 3. Local command rename (`.claude/commands/`)

- [ ] 3.1 Move the command file: `git mv .claude/commands/spec/apply.md .claude/commands/sfx/apply.md` (the directory segment is the command namespace), and confirm the now-empty `.claude/commands/spec/` directory is gone.
- [ ] 3.2 In the moved file, update the skill frontmatter `name` ("SPEC: Apply" → "SFX: Apply") and `description` (the `/spec:apply` mention → `/sfx:apply`).
- [ ] 3.3 Update every `/spec:apply` reference in the command body: the usage line, the worked examples, the `git commit -m "/sfx:apply <name>"` recipe, the success-output block, the override hints, and the guardrails (including the "first line must start with `/sfx:`" note).

## 4. Docs & comments

- [ ] 4.1 `README.md` — update the trigger line (`push a commit "/spec:apply…"`) and the `/spec:apply [<name>]` "trigger an apply" line to `/sfx:`.
- [ ] 4.2 `backend/README.md` — update every `/spec:apply` reference (intro, the trigger definition, the payload comment, the `opsx:apply` result-subject note, the concurrency paragraph, and the recovery paragraph).
- [ ] 4.3 `backend/src/github.ts` and `backend/src/handlers/push.ts` — update the `/spec:apply` comments.
- [ ] 4.4 `.github/workflows/apply.yml` — update the header comment (`Subject must not start with /spec:apply…`) and the rejected-push `::error::` message that says "re-trigger /spec:apply".

## 5. Validate

- [ ] 5.1 `openspec validate sfx-command-namespace --strict` passes.
- [ ] 5.2 Confirm no stray `/spec:apply` (or `/spec:` command) remains in code, tests, docs, the command file, or workflows (grep), excluding `openspec/changes/archive/`, `openspec/_planning/` history, and the intentional legacy-rejection test asserting `/spec:apply` is no longer a trigger. (The main specs are updated by the deltas at archive.)
- [ ] 5.3 Confirm no reference to the old command path `.claude/commands/spec/` remains.
