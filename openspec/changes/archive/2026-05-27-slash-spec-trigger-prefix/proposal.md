## Why

The apply trigger uses `@spec:apply`, which reads like an @-mention. We are
standardizing on a slash-command convention — `/spec:<command>` — for every Specfly
trigger going forward. Switching now, before the GitHub App goes public (R4), avoids
imposing a breaking trigger change on outside adopters later.

## What Changes

- **BREAKING**: the apply trigger prefix changes from `@spec:apply` to `/spec:apply`.
  The backend recognizes only the new prefix; a commit whose subject starts with
  `@spec:apply` is no longer a trigger and classifies as `ignore` (a no-op). Hard
  cutover — no dual-accept transition window.
- Trigger detection parses the `/spec:` command namespace: it extracts the command
  verb from the first line and recognizes `apply` only. The bare namespace (`/spec:`)
  and any other verb (e.g. `/spec:foo`) are not triggers. The matcher is structured so
  a future verb is a small addition, but no second verb is introduced here.
- `key=value` apply args (`model`, `effort`) are parsed after `/spec:apply` instead of
  `@spec:apply`; their semantics are unchanged.
- The runner's result-commit subject (`opsx:apply <name>`) and the App's CI-refresh
  subject (`chore: re-run CI`) still do not start with `/spec:apply`, so the
  loop-prevention invariant holds unchanged.
- Update unit tests, the four affected spec docs, both READMEs, the example workflow,
  and code/workflow comments to the new prefix.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `apply-dispatch`: the trigger marker becomes the `/spec:` command namespace. Push
  classification, trigger-detection criteria, and apply-argument parsing move to
  `/spec:apply`, and a new requirement defines command-verb recognition (only `apply`
  is recognized; the bare namespace and unknown verbs are not triggers).
- `apply-concurrency`: the coalescing requirement and scenarios reference `/spec:apply`
  triggers instead of `@spec:apply`.
- `apply-runner`: the result-commit invariant requires the subject to not start with
  `/spec:apply` (was `@spec:apply`).
- `pr-authoring`: the human-push and result-push requirements reference the
  `/spec:apply` marker instead of `@spec:apply`.

## Impact

- **Functional code**: `backend/src/logic.ts` — the only behavior change (replace the
  `MARKER` literal with `/spec:` namespace + command parsing in `isTriggerCommit` and
  `parseApplyArgs`).
- **Tests**: `backend/test/logic.test.ts`.
- **Specs**: `apply-dispatch`, `apply-concurrency`, `apply-runner`, `pr-authoring`.
- **Docs & comments**: `README.md`, `backend/README.md`, `examples/adopter-workflow.yml`,
  comments in `backend/src/github.ts` and `backend/src/handlers/push.ts`, and the
  comments plus the rejected-push `::error::` text in `.github/workflows/apply.yml`.
- **Adopters**: anyone pushing `@spec:apply` must switch to `/spec:apply`. Acceptable
  now (pre-public); it becomes a migration burden if deferred past R4.
