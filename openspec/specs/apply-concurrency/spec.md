# apply-concurrency Specification

## Purpose
TBD - created by syncing change supersede-concurrent-applies. Update Purpose after archive.
## Requirements
### Requirement: Latest apply wins via concurrency cancellation

The reusable apply workflow (`.github/workflows/apply.yml`) SHALL declare a
**job-level** `concurrency` on its `apply` job, with a group keyed per change
(`group: specfly-apply-${{ inputs.change }}`) and `cancel-in-progress: true`. Because
each `repository_dispatch` runs a separate caller workflow run that calls this reusable
workflow, all such runs for one change share a single concurrency group; a newer
trigger's apply job SHALL cancel any in-flight apply job for the same change before it
reaches the push step, so rapid same-branch `@specfly:apply` triggers resolve to exactly
one effective apply and the **newest** trigger is the one that pushes.

#### Scenario: A newer trigger cancels the in-flight apply

- **WHEN** two `@specfly:apply` commits are pushed to `change/<name>` in quick
  succession and the backend re-dispatches for each, while the first apply job is still
  running
- **THEN** the second apply job shares the concurrency group `specfly-apply-<name>` and
  cancels the first apply job, so only the second runs to completion and pushes

#### Scenario: The superseded apply does not push

- **WHEN** an apply job is cancelled by a newer apply in the same concurrency group
- **THEN** it is terminated before its "Commit and push change branch" step, so it
  performs no `git push` to `change/<name>` and produces no result push

#### Scenario: Group key comes from the workflow input

- **WHEN** the concurrency group expression is evaluated inside the reusable workflow
- **THEN** it uses `inputs.change` (passed by the caller from
  `client_payload.change`), which is available in the called-workflow context, rather
  than `github.event.client_payload.change`

### Requirement: Adopters inherit the guard via the reusable workflow

The concurrency guard SHALL reside in the reusable `apply.yml` referenced as `@v1`, so
adopters obtain it without editing the caller workflow they copied from
`examples/adopter-workflow.yml`. The caller example SHALL NOT need a functional change
to gain superseding behavior; any change to the example is documentation only.

#### Scenario: An adopter on @v1 inherits superseding with no caller change

- **WHEN** an adopter references `foster-systems/specfly/.github/workflows/apply.yml@v1`
  from an unmodified copied caller
- **THEN** rapid same-branch triggers are superseded by the reusable workflow's
  concurrency guard, with no edit required to the adopter's caller workflow
