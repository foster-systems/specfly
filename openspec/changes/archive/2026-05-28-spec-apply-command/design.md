## Context

The remote-apply flow already works end-to-end (App + backend + reusable workflow).
The only step still done by hand is the trigger: on `change/<name>`, make a commit
whose first line is `/spec:apply` and push it (HIGH-LEVEL-DESIGN §7 step 2;
`briefing-first-live-apply.md:57-61`). The trigger contract is fully specified on the
backend side (`openspec/specs/apply-dispatch/spec.md`): first line `/spec:apply`
(case-sensitive, leading whitespace trimmed), optional `model=`/`effort=` tokens, on
a `change/<name>` ref, human sender, and a *new sha* to avoid per-sha dedup.

This change adds the local command that performs that recipe. It is a documentation +
command-file change — no TypeScript, no backend, no workflow edits.

Crucially, `/opsx:propose` *writes* the change files but does not commit them or create
the branch — after proposing you are typically on `main` with `openspec/changes/<name>/`
untracked and no `change/<name>` branch. So the first `/spec:apply` runs from a dirty
tree on the wrong branch: creating `change/<name>` and committing the proposal is the
**main** path, not an edge case. R9's "no manual commit/message/push" only holds if the
command owns that.

## Goals / Non-Goals

**Goals:**

- One local command, `/spec:apply`, that turns the manual commit+push into a single step.
- Keep the adopter footprint minimal and transparent: one committed file, same channel
  as the vendored `.claude/commands/opsx/*`.
- Keep the command a thin, agent-agnostic shim over `git` so other agents are cheap later.

**Non-Goals:**

- No backend, App, or `apply.yml` changes — the trigger contract is unchanged.
- No plugin/marketplace distribution.
- No shims for other agents in this change (only document that the recipe is portable).
- No verification that the Specfly App is installed or that `specfly.yml` is on the
  default branch — the command can't see those; it surfaces them as prerequisites.

## Decisions

**Name `/spec:apply` (not `/specfly:apply`).** Symmetric with the marker it emits and
the `/spec:` namespace from R8 — you type `/spec:apply` and it pushes a `/spec:apply`
commit. The near-collision with the local `/opsx:apply` is acceptable: different
namespace, and the docs draw the line (remote trigger vs. local implement).

**Ship as a committed command file `.claude/commands/spec/apply.md` (not a plugin).**
Mirrors the existing "one workflow file" footprint and the way OpenSpec already
vendors `.claude/commands/opsx/*` into the repo. Fully transparent (the adopter reads
exactly what runs), no new distribution channel to build or version. The canonical
copy lives in this repo as the source of truth and is dogfooded here. Alternative — a
Claude Code plugin — would give zero repo files but adds an install step and hides the
logic, which is off-brand for a tool that advertises "read exactly what runs."

**Empty trigger commit by default (`--allow-empty`).** The trigger is the subject, not
a diff. Forcing a fresh sha on every run is what makes re-applies work: a same/redelivered
sha is deduped by the backend and won't re-fire (per-sha idempotency in
`apply-dispatch`). Any pending edits under the change dir are committed *first* under a
non-marker subject, keeping the trigger commit purely the marker.

**Non-forced push, fail closed.** Mirrors the runner's own push discipline in
`apply.yml` — a diverged remote tip should error, never be clobbered.

**Require a clean tree except the change dir.** The command commits edits under
`openspec/changes/<name>/` (the proposal) but refuses to run when anything outside that
dir is dirty (tracked, staged, or untracked), asking the user to commit/stash first.
Rationale: the local push only needs the change dir on the branch — the *code* changes
are produced remotely by the worker — so there is never a reason to sweep unrelated
working-tree edits onto the change branch, and refusing avoids carrying secrets/junk or
surprising the user. Rejected `git add -A` (convenient but unsafe) and "commit only the
change dir, ignore the rest silently" (less surprising than `-A`, but leaving a dirty
tree behind mid-flow is confusing); an explicit stop is the most predictable.

**Create-if-absent, confirm-if-switching.** When `change/<name>` does not exist, create
it from `HEAD` (the normal first run). When it exists but you are elsewhere — or you are
on a different `change/<other>` — stop and confirm before switching, because switching
branches is where confusion/data-loss lives and a mismatched `change/<other>` is usually
a mistake. Rejected always-auto-switch (too surprising) and never-switch (pushes branch
positioning back onto the user, breaking the "one command" promise on the first run).

**Thin shim = free multi-agent.** The command is just `git` plus name/branch
resolution. The recipe (`change/<name>` + `/spec:apply` first line + push) *is* the
agent-agnostic contract; a future Cursor/Codex/etc. integration re-implements the same
recipe in its own command format with no backend change.

## Risks / Trade-offs

- **Empty commits accumulate in branch history** → Accepted: the design already states
  the marker "lives permanently in branch history" (§11 Q2); empty markers are cheap and
  the branch is short-lived (merged/closed after the PR).
- **Command can't confirm App/secret/workflow setup** → Mitigation: it reports the
  prerequisites to check when nothing happens, rather than guessing at remote state it
  cannot see.
- **Name confusion `/spec:apply` vs `/opsx:apply`** → Mitigation: the command's own
  "Using change: …" announcement and the README/docs make the remote-vs-local
  distinction explicit.
- **Adopter footprint grows by one file** → Accepted and bounded: it's one file on the
  same channel they already use for `opsx` commands.
