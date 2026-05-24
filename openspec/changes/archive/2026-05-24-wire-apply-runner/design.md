## Context

`.github/workflows/apply.yml` is a **reusable** workflow (`on: workflow_call`).
Adopters never trigger it directly; their thin caller
(`examples/adopter-workflow.yml`) runs `on: repository_dispatch` (type
`specfly-apply`, fired by the Specfly backend) and maps the dispatch's
`client_payload` onto this workflow's inputs (`change`, `model`, `effort`) plus the
`anthropic_api_key` secret. The job codes and pushes the `change/<name>` branch using
the built-in `GITHUB_TOKEN`; the backend (not this workflow) opens the PR.

The backend↔runner contract is fixed (briefing-build §11.2, §12): the backend always
passes `change` and `branch` in `client_payload` precisely because
`repository_dispatch` runs the workflow **as defined on the default branch**, with
the run's `github.ref`/`github.ref_name` pointing at the default branch — not
`change/<name>`. This wiring must consume exactly that contract.

Three items remain in the file: a checkout that reads the wrong branch on dispatch
(a correctness bug), and two TODOs (bot commit identity; documenting the handshake).

## Goals / Non-Goals

**Goals:**
- On `repository_dispatch`, check out the human-pushed `change/<name>` branch so
  `/opsx:apply` runs against the tree where `openspec/changes/<name>/` exists.
- Attribute applied commits to the Specfly bot identity, with comments that prevent
  anyone from mistaking the attribution for verified authorship or a changed sender.
- Make the implicit push → PR-open handshake explicit in comments, without adding a
  runner → backend callback.
- Keep both workflow files `actionlint`-clean and record a manual e2e test plan.

**Non-Goals:**
- Relaxing the package-manager / OpenSpec prerequisite hard-fails (DESIGN §11.3 is
  an unsettled, separate decision).
- Touching the Claude invocation, model/effort inputs, log streaming, or artifact
  upload.
- The optional `head_sha` determinism hardening (deferred; see Risks).
- Deploying or registering anything; making the push appear to come from `specfly[bot]`.

## Decisions

### 1. Derive the checkout ref from `inputs.change`, not `github.ref`

```yaml
ref: ${{ inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref }}
```

GitHub Actions evaluates `A && B || C` as a ternary. On a dispatched run
`inputs.change` is set, so the ref resolves to `refs/heads/change/<name>` (the
human-pushed branch). If the workflow is ever called on a `change/*` push with no
input, it falls back to `github.ref`. This is the minimal fix that satisfies the
contract.

- **Alternative — keep `github.ref` and `git fetch`/`checkout` the branch in a later
  step:** rejected; more moving parts and the resolve-change-name step's existence
  check (`openspec/changes/<name>`) would still fail until the right tree is present.
- **Alternative — check out `client_payload.head_sha`:** deferred (see Risks). The
  branch tip is correct for the common case and avoids a new input + caller change.

Step order is unchanged: checkout → resolve change name → … The "Resolve change name"
step already prefers `inputs.change`, so it stays correct, and its
`openspec/changes/<name>` check now passes because the right branch is checked out.

### 2. Bot commit identity is cosmetic attribution only

```yaml
git config user.name  "specfly[bot]"
git config user.email "287375800+specfly[bot]@users.noreply.github.com"
```

`287375800` is the registered Specfly App's real, fixed bot user id — hardcoded, no
placeholder. This sets *commit authorship* only. It deliberately does **not**:
- make commits GPG-"Verified" (only API-authored commits are), and
- change the webhook `sender`. The push is authenticated by `GITHUB_TOKEN`, so the
  backend always sees the result push as `sender == github-actions[bot]` — which is
  exactly what its result-detection keys on (apply-dispatch / briefing-build §11.3).

These facts must be encoded in comments so no future maintainer tries to "fix" the
sender or assumes verified authorship.

### 3. The push → PR-open handshake is implicit; no callback

There is no runner → backend callback. The runner pushes the result to
`change/<name>` via `GITHUB_TOKEN` (keeping `actions/checkout`'s default
`persist-credentials: true`), and the backend's `push` webhook handler opens/updates
the PR as `Specfly[bot]`. The existing final steps already satisfy this; the only
change is a comment making the handshake explicit. The commit subject stays
`opsx:apply <name>` (must not start with `@specfly:apply`) and `apply.jsonl` stays
excluded via `git reset -- apply.jsonl`.

## Risks / Trade-offs

- **Concurrent pushes to `change/<name>` during an apply** → the branch tip could move
  between checkout and push. Mitigation now: the job-level concurrency guard
  (`apply-concurrency`) supersedes in-flight applies so latest wins; the optional
  `head_sha` checkout (check out the dispatched sha, push back with
  `HEAD:refs/heads/change/<name>`) is documented as future hardening, not done here.
- **Result commit subject accidentally matching `@specfly:apply`** → would re-trigger
  a dispatch loop. Mitigation: the subject is fixed to `opsx:apply <name>`; this is a
  guardrail the verifier checks.
- **Maintainer misreads the bot email as verified/sender attribution** → could prompt
  a misguided change to use a PAT/App token for the push. Mitigation: explicit
  comments stating the attribution is cosmetic and the sender stays
  `github-actions[bot]`.
- **No result push when apply makes no changes or fails** → no PR opens; acceptable
  for now (failure is visible in the adopter's Actions run). Out of scope here.

## Migration Plan

No deploy. A live end-to-end run is gated on the App + backend existing, so it is a
**manual test plan** recorded in the workflow / PR description; the maintainer runs it
later (test adopter repo with App installed + backend deployed + protected `main`:
push an `@specfly:apply` commit, observe dispatch → checkout `change/<name>` →
`/opsx:apply` → `opsx:apply <name>` push → backend opens PR as `Specfly[bot]`;
confirm no dispatch loop). Rollback is reverting the workflow edits.

## Open Questions

- DESIGN §11.3 (relaxing the pnpm/bun + OpenSpec prerequisites) stays OPEN and is out
  of scope for this change.
