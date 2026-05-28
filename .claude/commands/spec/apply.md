---
name: "SPEC: Apply"
description: Trigger a REMOTE Specfly apply — craft the /spec:apply trigger commit on change/<name> and push it (distinct from /opsx:apply, which implements tasks locally)
category: Workflow
tags: [workflow, specfly, remote, trigger]
---

Trigger a **remote** Specfly apply run for an OpenSpec change.

> **This triggers the REMOTE apply.** It crafts the `/spec:apply` trigger commit
> and pushes it so the Specfly backend dispatches the apply onto your GitHub
> Actions runner. It is **distinct from `/opsx:apply`**, which implements a
> change's tasks **locally** on this machine. Use `/spec:apply` when you want the
> GitHub worker to do the apply and open a PR; use `/opsx:apply` to implement
> locally.

**Usage**: `/spec:apply [<name>] [model=<m>] [effort=<e>]`

- `<name>` — the OpenSpec change to apply. Optional; resolved automatically (see below).
- `model=<m>` — optional Claude model for the remote run (e.g. `model=opus`).
- `effort=<e>` — optional thinking effort for the remote run (e.g. `effort=high`).

This command is a thin shim over `git`: the trigger contract is pure git
(`change/<name>` branch + a `/spec:apply` first-line tip commit + a push), so it
carries no backend-specific logic.

**Steps**

1. **Resolve the change name**

   Resolve the name in this order:
   - If an explicit `<name>` argument is given, use it (it overrides everything else).
   - Otherwise, if the current branch is `change/<name>`, infer `<name>` from it.
   - Otherwise, enumerate the directories under `openspec/changes/` (excluding
     `archive/`). If exactly one exists, use it. If more than one exists, list
     them and use the **AskUserQuestion tool** to let the user pick.

   Always announce: `Using change: <name>` and how to override (e.g.
   `/spec:apply <other>`).

2. **Preflight (fail fast — do NOT commit or push if any check fails)**

   Stop with clear, actionable guidance if any of these are not satisfied:
   - The working directory is a git repository (`git rev-parse --is-inside-work-tree`).
   - An `origin` remote exists (`git remote get-url origin`). If absent, stop and
     explain that the trigger must be pushed to `origin`.
   - At least one change exists under `openspec/changes/`. If none, stop and direct
     the user to create one first (e.g. `/opsx:propose`).
   - The resolved `openspec/changes/<name>/` directory exists locally. If it does
     not, stop with a clear error and do NOT commit or push — the runner would
     otherwise error `No directory found at openspec/changes/<name>/` because it
     checks out the trigger sha and the change dir must ride on it.

   Then a **clean-working-tree** check. Inspect `git status --porcelain`. Refuse to
   proceed if any tracked-modified, staged, or untracked change exists **outside**
   `openspec/changes/<name>/`. Stop and ask the user to commit or stash those edits
   first — the local push only needs the change dir on the branch (the code changes
   are produced remotely by the worker), so there is never a reason to sweep
   unrelated working-tree edits onto the change branch. Edits **inside**
   `openspec/changes/<name>/` are fine — they get committed when crafting the trigger.

   Finally, a **non-blocking apply-readiness warning**. Run
   `openspec status --change <name> --json` and, if the change is not yet
   apply-ready (e.g. it has no tasks), **warn** the user that the remote
   `/opsx:apply` may have nothing actionable to do — but allow them to proceed.

3. **Ensure the `change/<name>` branch**

   The change artifacts must ride on the trigger sha, so the work must land on
   `change/<name>`:
   - If the current branch is already `change/<name>`, proceed.
   - If `change/<name>` does NOT exist, create it from the current `HEAD`
     (`git switch -c change/<name>`). This is the normal first run after
     `/opsx:propose`, which writes the change dir but leaves you on a base branch.
   - If `change/<name>` exists but you are on a different branch — or you are on a
     different `change/<other>` (a likely mistake) — do NOT switch silently. **Stop
     and confirm the switch with the user** before switching.
   - On a detached `HEAD`, stop with guidance (check out a branch first) — do not
     commit or push.

4. **Craft the commits**

   - First, if there are pending edits under `openspec/changes/<name>/`, stage and
     commit them under a subject that does NOT begin with `/spec:apply` — e.g.
     `git add openspec/changes/<name>` then `git commit -m "docs(<name>): proposal"`.
     The subject must not start with `/spec:apply` or it would itself be a trigger.
   - Then craft the trigger commit:

     ```bash
     git commit --allow-empty -m "/spec:apply <name>"
     ```

     Append ` model=<m>` and/or ` effort=<e>` to the subject **only** when those
     arguments were supplied — e.g. `/spec:apply <name> model=opus effort=high`.
     The first line must start with `/spec:` immediately followed by the verb
     `apply` (case-sensitive); only `model` and `effort` `key=value` tokens are
     recognized — anything else is ignored by the backend.

   The `--allow-empty` is deliberate: the trigger is the **subject**, not a diff.
   It guarantees a fresh sha on every run, so a re-apply always re-dispatches — a
   repeated or redelivered sha is deduped by the backend and would NOT re-fire.

5. **Push (never force)**

   ```bash
   git push origin HEAD:refs/heads/change/<name>
   ```

   Never use `--force`. If the push is rejected as a non-fast-forward, **stop** and
   explain that the remote `change/<name>` tip has diverged — do not clobber it.
   Ask the user to reconcile (e.g. pull/inspect the remote tip) and retry.

6. **Report what happens next**

   After a successful push, tell the user:
   - The flow: your push fires the Specfly App's push webhook → the backend sends a
     `repository_dispatch` of type `specfly-apply` → your runner runs `/opsx:apply`
     and pushes the result commits to `change/<name>` → `Specfly[bot]` opens (or
     updates) the PR once apply completes.
   - Where to watch: the repo's **Actions** tab for the apply run, and the PR
     authored by **`specfly[bot]`**.
   - Re-running is simply `/spec:apply` again (each run pushes a fresh-sha empty
     trigger and re-dispatches; an existing PR updates in place).
   - Prerequisites to check **if nothing happens** (this command cannot verify
     them): the Specfly App is installed on the repo; the `ANTHROPIC_API_KEY`
     secret is set; and the caller workflow `specfly.yml` exists on the repo's
     **default** branch.

**Output On Success**

```
Using change: <name>  (override: /spec:apply <other>)

✓ Committed change-dir edits: docs(<name>): proposal
✓ Trigger pushed: /spec:apply <name>  →  change/<name>

What happens next:
  push webhook → repository_dispatch (specfly-apply) → runner runs /opsx:apply
  → Specfly[bot] opens/updates the PR.

Watch: the repo's Actions tab; the PR authored by specfly[bot].
Re-run anytime with: /spec:apply <name>

If nothing happens, check: Specfly App installed · ANTHROPIC_API_KEY secret set
· specfly.yml present on the default branch.
```

**Guardrails**
- This triggers the **remote** apply — it is NOT `/opsx:apply` (local implement).
- Fail fast on any preflight miss — never commit or push when a precondition fails.
- Refuse to run with unrelated dirty working-tree state; ask to commit/stash first.
- Never switch branches silently when `change/<name>` exists and you are elsewhere
  (or on a mismatched `change/<other>`) — confirm first.
- Always use `--allow-empty` for the trigger commit so re-runs get a fresh sha.
- Never `--force`-push; a diverged remote tip fails closed.
- The trigger subject's first line must be `/spec:apply <name>` (case-sensitive),
  with only `model=`/`effort=` tokens appended when supplied.
- This recipe is agent-agnostic: `change/<name>` branch + `/spec:apply` first-line
  tip commit + push is the whole contract; any future agent can mirror it.
