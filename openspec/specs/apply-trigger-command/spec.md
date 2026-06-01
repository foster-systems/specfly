# apply-trigger-command Specification

## Purpose
TBD - created by syncing change spec-apply-command. Update Purpose after archive.
## Requirements
### Requirement: Local apply-trigger command

The system SHALL provide a local command `/sfx:apply` that crafts a conformant
apply trigger and pushes it, automating the manual `git commit`/`git push` step an
adopter would otherwise perform. The command SHALL accept an optional change name
and optional `model=<m>` / `effort=<e>` arguments (`/sfx:apply [<name>] [model=<m>]
[effort=<e>]`). It SHALL be distinct from `/opsx:apply`, which implements a change's
tasks locally; `/sfx:apply` triggers the remote apply run instead.

#### Scenario: Command crafts and pushes a trigger

- **WHEN** a user runs `/sfx:apply <name>` on a repo set up for Specfly
- **THEN** the command creates a `/sfx:apply <name>` tip commit on `change/<name>`
  and pushes it to `origin`, so the backend dispatches the remote apply

#### Scenario: Distinct from local apply

- **WHEN** a user wants the GitHub worker to run the apply rather than implementing
  tasks on their own machine
- **THEN** they use `/sfx:apply` (remote trigger), not `/opsx:apply` (local implement)

### Requirement: Change-name resolution

The command SHALL resolve the change name from, in order: the explicit argument; the
current branch when it is `change/<name>`; otherwise the set of directories under
`openspec/changes/`. When the name remains ambiguous the command SHALL prompt the
user to choose. The command SHALL announce the resolved name and how to override it.

#### Scenario: Name from argument

- **WHEN** the user runs `/sfx:apply add-auth`
- **THEN** the resolved change name is `add-auth`

#### Scenario: Name inferred from branch

- **WHEN** no argument is given and the current branch is `change/add-auth`
- **THEN** the resolved change name is `add-auth`

#### Scenario: Ambiguous name prompts the user

- **WHEN** no argument is given, the branch is not `change/<name>`, and more than one
  change exists under `openspec/changes/`
- **THEN** the command lists the changes and asks the user to select one

### Requirement: Preflight validation

The command SHALL fail fast with actionable guidance, without committing or pushing,
when its preconditions are not met: the working directory is not a git repository; no
`origin` remote exists; no OpenSpec change exists under `openspec/changes/`; or the
resolved `openspec/changes/<name>/` does not exist locally (the runner would otherwise
error `No directory found at openspec/changes/<name>/`).

#### Scenario: No change exists

- **WHEN** there is no change directory under `openspec/changes/`
- **THEN** the command stops and directs the user to create one (e.g. `/opsx:propose`)

#### Scenario: Missing change directory

- **WHEN** `openspec/changes/<name>/` does not exist locally for the resolved name
- **THEN** the command stops with a clear error and does not commit or push

#### Scenario: No origin remote

- **WHEN** the repository has no `origin` remote
- **THEN** the command stops with guidance and does not commit or push

### Requirement: Clean-working-tree precondition

The command SHALL require the working tree to be clean except for changes under the
resolved `openspec/changes/<name>/` directory. When any tracked modification, staged
change, or untracked file exists outside that directory, the command SHALL stop and
ask the user to commit or stash it first, rather than carrying unrelated edits onto
the change branch. Edits under the change directory itself are permitted (they are
committed as part of crafting the trigger).

#### Scenario: Unrelated edits block the run

- **WHEN** the working tree has modified, staged, or untracked changes outside
  `openspec/changes/<name>/`
- **THEN** the command stops and asks the user to commit or stash them before retrying

#### Scenario: Edits confined to the change dir are allowed

- **WHEN** the only working-tree changes are under `openspec/changes/<name>/`
- **THEN** the precondition is satisfied and the command proceeds

### Requirement: Apply-readiness warning

Before pushing, the command SHALL check the change's apply-readiness (e.g. via
`openspec status --change <name>`) and SHALL warn — without blocking — when the change
is not yet apply-ready, because the remote `/opsx:apply` would otherwise have nothing
actionable to do.

#### Scenario: Not-ready change warns but proceeds

- **WHEN** the resolved change is missing artifacts required to apply (e.g. no `tasks`)
- **THEN** the command warns that the remote apply may no-op, but still allows the user
  to proceed

### Requirement: Branch enforcement

The command SHALL ensure the work lands on branch `change/<name>` so the change
artifacts ride on the trigger sha. When the current branch is already `change/<name>`,
it SHALL proceed. When `change/<name>` does not exist, it SHALL create it from the
current `HEAD`. When `change/<name>` exists but the current branch is different — or
the current branch is a different `change/<other>` — the command SHALL NOT switch
silently; it SHALL stop and confirm the switch with the user (a mismatched
`change/<other>` is most likely a mistake). On a detached `HEAD`, the command SHALL
stop with guidance.

#### Scenario: Create the branch when absent

- **WHEN** the resolved name is `add-auth`, `change/add-auth` does not exist, and the
  current branch is a base branch (e.g. `main`)
- **THEN** the command creates `change/add-auth` from `HEAD` and proceeds

#### Scenario: Already on the matching branch

- **WHEN** the current branch is `change/add-auth` and the resolved name is `add-auth`
- **THEN** the command proceeds without switching

#### Scenario: Confirm before switching to an existing branch

- **WHEN** `change/add-auth` exists but the current branch is something else
- **THEN** the command stops and asks the user to confirm switching before continuing

#### Scenario: Mismatched change branch is flagged

- **WHEN** the current branch is `change/other` and the resolved name is `add-auth`
- **THEN** the command warns about the mismatch and does not switch without confirmation

#### Scenario: Detached HEAD stops

- **WHEN** `HEAD` is detached
- **THEN** the command stops with guidance and does not commit or push

### Requirement: Trigger commit crafting

The command SHALL produce a tip commit that conforms to the apply trigger contract:
its first line SHALL be `/sfx:apply <name>`, optionally followed by `model=<m>` and
`effort=<e>` tokens when those arguments are supplied (matching the backend's
case-sensitive, first-line parsing). When the working tree has pending edits under
the change directory, the command SHALL commit those first under a subject that does
NOT begin with `/sfx:apply` (so it is not itself a trigger), then create the trigger
commit. The trigger commit SHALL be created with `--allow-empty`.

#### Scenario: Trigger subject carries optional args

- **WHEN** the user runs `/sfx:apply add-auth model=opus effort=high`
- **THEN** the trigger commit's first line is `/sfx:apply add-auth model=opus effort=high`

#### Scenario: Pending edits committed separately

- **WHEN** the working tree has uncommitted edits under `openspec/changes/<name>/`
- **THEN** those edits are committed under a non-`/sfx:apply` subject before the
  trigger commit is created

### Requirement: Fresh sha per run and non-destructive push

The command SHALL create the trigger commit with `--allow-empty` so that every
invocation yields a new sha, ensuring a re-run always re-dispatches rather than being
deduplicated as a redelivery of an already-seen sha. The command SHALL push with a
non-forced push to `change/<name>`, failing closed if the remote tip has diverged.

#### Scenario: Re-run re-dispatches

- **WHEN** the user runs `/sfx:apply <name>` a second time with no new edits
- **THEN** an empty trigger commit with a new sha is pushed, so the backend creates a
  new run and dispatches again

#### Scenario: Diverged remote fails closed

- **WHEN** the remote `change/<name>` tip has diverged such that the push is not a
  fast-forward
- **THEN** the push is rejected and the command does not force-push over the remote tip

### Requirement: Downstream-flow reporting

After pushing, the command SHALL report what happens next — push webhook →
`repository_dispatch` → the adopter runner runs `/opsx:apply` → `Specfly[bot]`
opens or updates the PR — and where to observe it (the Actions tab; the PR authored
by `specfly[bot]`). Because the command cannot verify that the Specfly App is
installed or that the caller workflow exists on the default branch, it SHALL surface
those as prerequisites to check if nothing happens.

#### Scenario: Reports next steps after push

- **WHEN** the trigger has been pushed
- **THEN** the command tells the user the dispatch/PR flow, where to watch it, and
  that re-running is simply `/sfx:apply` again

### Requirement: Agent-agnostic trigger recipe

The command SHALL contain no logic specific to any backend behavior beyond the public
trigger contract (`change/<name>` branch + `/sfx:apply` first-line tip commit +
push). The git recipe it follows SHALL stand as the agent-agnostic contract that any
future non-Claude agent integration can mirror without backend changes.

#### Scenario: No backend coupling

- **WHEN** the command is implemented
- **THEN** it relies only on the documented trigger contract and requires no change to
  the backend or the reusable workflow
