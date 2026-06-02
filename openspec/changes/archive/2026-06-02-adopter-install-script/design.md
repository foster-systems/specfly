## Context

One-time adopter setup is documented across `docs/getting-started.md` (§1–5) and
`docs/protect-main.md`. Of the steps, four are mechanical and scriptable, and two
require a browser:

| Step | Mechanical? | How |
| --- | --- | --- |
| Install OpenSpec + `openspec init` | partial | needs the user to run an installer & commit; can detect/guide |
| Install the Specfly GitHub App | **no** | browser OAuth install picker — cannot be scripted |
| Add `ANTHROPIC_API_KEY` secret | yes | `gh secret set ANTHROPIC_API_KEY` |
| Add caller workflow | yes | write `.github/workflows/specfly.yml` |
| Copy command file | yes | write `.claude/commands/sfx/apply.md` |
| Protect `main` | yes | `gh api .../rulesets` (the JSON in protect-main.md) |

The installer's job is to do the mechanical ones and pause for the human ones, in
the right order, idempotently. It runs **inside the adopter's repo clone** (where
`origin` points at their GitHub repo) — not specfly's repo. It is the same
authoring channel the docs already prescribe; it writes nothing new.

The `examples/adopter-workflow.yml` and `.claude/commands/sfx/apply.md` files in the
specfly repo are the source of truth for the two written files. The installer must
obtain their current contents; when run via `curl | bash` it cannot assume a local
checkout, so it fetches them from the pinned release ref.

## Goals / Non-Goals

**Goals:**

- One command that takes an adopter from "cloned repo" to "ready to `/sfx:apply`",
  doing every mechanical step and guiding every manual one.
- Safe to re-run: detect what's already in place, skip or confirm before overwriting,
  never clobber or force-write.
- Fail fast and mutate nothing when preconditions (`gh`, `git`, GitHub `origin`) are
  unmet, with actionable guidance.
- Stay a thin reflection of the docs: the files and settings it writes are exactly
  those `getting-started.md` / `protect-main.md` already prescribe.

**Non-Goals:**

- Automating the GitHub App install or API-key creation (both are browser-only).
- Hosting/serving the script at `specfly.dev/install.sh` (that ships with R12; until
  then it is fetched from raw GitHub or run from a clone).
- Configuring CI status checks, multi-repo/org installs, or anything beyond the
  documented single-repo adopter setup.
- Backend or reusable-workflow changes.

## Decisions

**1. A single `bash` script at the repo root, runnable via pipe or directly.**
`curl -fsSL <url> | bash` is the idiomatic installer UX and works without a clone;
the same file also runs as `bash install.sh` from a checkout. Targeting `bash`
(not POSIX `sh`) buys arrays, `[[ ]]`, and `read -r` prompts on the macOS/Linux
adopters we support. *Alternative — a Node/TS CLI:* heavier, adds a runtime
dependency, and duplicates what `gh` already does; rejected. *Alternative — a
`gh` extension:* narrower reach and an extra install step; rejected.

**2. Lean entirely on the `gh` CLI for GitHub mutations.** `gh secret set` and
`gh api .../rulesets` already encapsulate auth, repo resolution (`{owner}/{repo}`),
and API plumbing — re-deriving them with raw `curl` + tokens would be fragile.
The installer therefore **requires `gh` authenticated** and checks `gh auth status`
in preflight. *Alternative — raw REST with a PAT:* more prompts, token handling,
and surface area; rejected.

**3. Fetch the two written files from the pinned release ref, not inline copies.**
Embedding the workflow/command contents in the script would let them drift from the
source of truth. Instead the installer downloads `examples/adopter-workflow.yml` and
`.claude/commands/sfx/apply.md` from the same pinned ref the reusable workflow uses
(`@v1`), so the script, the workflow it writes, and the runtime stay in lockstep.
When run from a local checkout it may read them from disk. *Alternative — inline
heredocs:* simplest but drifts; rejected.

**4. Idempotency by detect-then-decide, per artifact.** For each file: if absent,
write it; if present and identical, report "already present" and skip; if present
and different, show the diff and prompt (default: keep existing). For the secret:
`gh secret set` is itself idempotent (overwrites), but the installer asks before
setting if one already exists. For the ruleset: `gh api` to list rulesets, skip if a
matching `Protect main`-style ruleset already targets the default branch, else offer
to create it. This makes re-runs converge without surprises.

**5. Order the flow so blocking prerequisites come first, mutations last.**
Preflight (`gh`/`git`/`origin`) → OpenSpec check/guide → write files → set secret →
App-install guide → optional ruleset → final summary with what was done, skipped,
and what the user must still verify. Manual gates use `read -r` pauses ("Press Enter
once you've installed the App…") and print the exact URLs
(`github.com/apps/specfly`, the repo's Actions-secrets settings page).

**6. Non-interactive / CI-safe behavior.** When stdin is not a TTY (piped without a
terminal) or a `--yes`/`--non-interactive` flag is passed, the installer does the
unambiguous mechanical steps, **never** auto-confirms destructive overwrites or the
ruleset mutation, and prints the manual steps as a checklist instead of pausing.
This keeps `curl | bash` usable while never silently changing repo settings.

## Risks / Trade-offs

- **`gh` not installed / not authed** → preflight detects both (`command -v gh`,
  `gh auth status`) and stops with the install/auth commands before any mutation.
- **Wrong repo context** (run outside a repo, or `origin` not on GitHub) → preflight
  resolves the repo via `gh repo view`/`git remote` and refuses if it can't, so the
  installer never writes to the wrong place.
- **Clobbering customized adopter files** (they edited their workflow) → never
  force-write; on content mismatch show a diff and default to keeping theirs.
- **Ruleset misconfiguration locking the user out** → the installer applies the exact
  vetted JSON from `protect-main.md` with an **empty** bypass list, prompts before
  creating, and points to the manual UI option; it never edits an existing ruleset.
- **Pinned ref drift / fetch failure** (offline, ref moved) → fetch failures stop
  with the manual copy-paste fallback (the same content the docs hold), so the user
  is never left half-set-up.
- **GitHub App install can't be verified** → the installer states plainly it cannot
  confirm the App is installed and lists it as the first thing to check if a later
  `/sfx:apply` produces no run (mirrors the command's downstream-flow reporting).
- **`bash`-only on minimal shells** → documented as a prerequisite; the macOS/Linux
  default `bash` suffices, and the manual steps remain fully documented as a fallback.

## Migration Plan

Additive: a new file plus doc edits. No rollback concerns — removing `install.sh`
reverts to the documented manual steps, which remain intact as the fallback path.
