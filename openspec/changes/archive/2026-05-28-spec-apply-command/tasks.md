## 1. Command file

- [x] 1.1 Create `.claude/commands/spec/apply.md` with front-matter (name "SPEC: Apply", a description making clear it triggers the REMOTE apply — distinct from `/opsx:apply`) and the `/spec:apply [<name>] [model=<m>] [effort=<e>]` usage.
- [x] 1.2 Write the change-name resolution step: arg (overrides) → infer from `change/<name>` branch → list `openspec/changes/*` and AskUserQuestion; announce "Using change: <name>" and the override.
- [x] 1.3 Write the preflight step: git repo + `origin` remote present; at least one change under `openspec/changes/`; resolved `openspec/changes/<name>/` exists; working tree clean except under the change dir (else stop, ask to commit/stash); warn (non-blocking) when the change isn't apply-ready (`openspec status --change <name>`). Fail fast, no commit/push.
- [x] 1.4 Write the branch step: if on `change/<name>` proceed; if absent create it from `HEAD`; if it exists but on a different branch (or a different `change/<other>`) stop and confirm the switch; on detached `HEAD` stop.
- [x] 1.5 Write the commit step: commit change-dir edits under a non-`/spec:apply` subject first, then `git commit --allow-empty -m "/spec:apply <name>[ model=<m>][ effort=<e>]"` (case-sensitive first line; args only when supplied).
- [x] 1.6 Write the push step: `git push origin HEAD:refs/heads/change/<name>`, no `--force`; on non-fast-forward, stop and explain (don't clobber).
- [x] 1.7 Write the report step: dispatch → `/opsx:apply` → `Specfly[bot]` PR flow, where to watch (Actions tab; `specfly[bot]` PR), re-run is just `/spec:apply`, and the App/workflow/secret prerequisites to check if nothing happens.

## 2. Docs

- [x] 2.1 README "Adopter setup": add a step to copy `.claude/commands/spec/apply.md` into the adopter repo, and note `/spec:apply` as the trigger (vs local `/opsx:apply`).
- [x] 2.2 HIGH-LEVEL-DESIGN §7 step 2: replace the manual `git commit`/`push` with "run `/spec:apply`"; update §4.4 footprint to "one workflow file + one command file".
- [x] 2.3 Tick R9 in `openspec/_planning/.roadmap.md`.

## 3. Verify

- [x] 3.1 `openspec validate spec-apply-command` passes.
