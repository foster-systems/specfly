## Why

The reusable apply workflow (`.github/workflows/apply.yml`) is scaffolded and
carries the concurrency guard, but it has one correctness bug and two unfinished
TODOs that block the dispatch → apply → PR flow. On `repository_dispatch` the run's
`github.ref` is the **default branch**, so the current `ref: ${{ github.ref }}`
checkout grabs `main` instead of `change/<name>` — and `/opsx:apply` then runs
against a tree where `openspec/changes/<name>/` does not exist.

## What Changes

- **Fix the checkout (correctness bug).** Derive the branch from `inputs.change` —
  `ref: ${{ inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref }}` —
  so a dispatched run checks out `refs/heads/change/<name>`, with a `github.ref`
  fallback for a direct `change/*` push. Step order (checkout → resolve change name)
  is preserved; the "Resolve change name" logic is unchanged.
- **Author commits as the Specfly bot (finish TODO).** Set the canonical bot
  identity `git config user.email "287375800+specfly[bot]@users.noreply.github.com"`
  (the registered App's real, hardcoded bot id). Comments must state this is
  **cosmetic attribution only**: it does not make commits GPG-"Verified" and does
  not change the webhook `sender` (the push stays `github-actions[bot]`).
- **Document the push → PR-open handshake (finish TODO).** The handshake is
  implicit and already correct: the runner pushes the result as `github-actions[bot]`
  via `GITHUB_TOKEN`, and the backend's `push` webhook opens/updates the PR as
  `Specfly[bot]`. Make this explicit with a comment; add **no** runner → backend
  callback. The result commit subject stays `opsx:apply <name>` (must not start with
  `@specfly:apply`, which would loop), and `apply.jsonl` stays excluded from the commit.
- Record a manual end-to-end test plan (a live run is gated on the App + backend
  existing) and mark `STATUS.md` step 3 complete.

Out of scope (do not touch): the package-manager / OpenSpec prerequisite hard-fail
logic (DESIGN §11.3, still unsettled); the Claude invocation, model/effort inputs,
log streaming, and artifact upload.

## Capabilities

### New Capabilities
- `apply-runner`: the reusable apply workflow's execution flow — checking out the
  dispatched `change/<name>` branch, authoring applied commits as the Specfly bot
  identity, and pushing the result branch as the implicit signal that drives the
  backend to open the PR (no runner → backend callback).

### Modified Capabilities
<!-- None. apply-concurrency already specifies the workflow's concurrency guard;
     those requirements are unchanged by this work. -->

## Impact

- `.github/workflows/apply.yml` — checkout `ref:`, git identity, push-step comment.
- `examples/adopter-workflow.yml` — verified to still map `client_payload` → inputs;
  unchanged (the optional `head_sha` hardening is deferred).
- `openspec/_planning/STATUS.md` — step 3 marked complete.
- Validation: `actionlint` clean on both workflow files.
