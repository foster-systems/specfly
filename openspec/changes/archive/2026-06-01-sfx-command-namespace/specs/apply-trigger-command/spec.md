## MODIFIED Requirements

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
