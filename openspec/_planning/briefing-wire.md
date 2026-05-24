# Build briefing — wire `apply.yml` (status step 3)

> **Audience:** a build agent in a fresh session, working in the
> `foster-systems/specfly` repo. This is the authoritative spec for finishing the
> reusable runner workflow `.github/workflows/apply.yml`. Read it fully first.
>
> **Prereq reading (in this repo):** `DESIGN.md` §5, §7 (usage flow); `status.md`;
> **`briefing-build.md` §11.2 and §12** (the backend↔runner contract — the
> `client_payload` shape and the default-branch dispatch trap). This wiring must
> consume exactly the contract the backend produces.
>
> **Parallel-safe:** this can be done alongside the backend build. Only one detail
> (the bot's numeric user id) is gated on the GitHub App existing; everything else
> can be completed now.

---

## 1. Context: how this workflow is invoked

`apply.yml` is a **reusable** workflow (`on: workflow_call`). Adopters never trigger
it directly — their thin caller (`examples/adopter-workflow.yml`) runs
`on: repository_dispatch` (type `specfly-apply`, fired by the Specfly backend) and
calls this workflow, mapping the dispatch's `client_payload` onto these inputs:

- `change` ← `client_payload.change` (the OpenSpec change name, e.g. `add-auth`)
- `model` ← `client_payload.model || 'sonnet'`
- `effort` ← `client_payload.effort || 'high'`
- secret `anthropic_api_key`

The job CODES and PUSHES the `change/<name>` branch using the built-in
`GITHUB_TOKEN`. The backend (not this workflow) opens the PR as `Specfly[bot]`.

---

## 2. What this task fixes

There are three changes. **(A) is a correctness bug** that blocks the dispatch flow;
(B) and (C) finish the two TODOs noted in the file.

### (A) Checkout the change branch — REQUIRED, currently wrong
`repository_dispatch` runs the workflow as defined on the **default branch**, and
the run's `github.ref`/`github.ref_name` are the **default branch**, NOT
`change/<name>`. The current checkout:

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
    ref: ${{ github.ref }}          # ← on dispatch this is the DEFAULT branch
```

…checks out the wrong branch, so `/opsx:apply` would run against `main` and the
`openspec/changes/<name>/` directory (which only exists on `change/<name>`) would be
missing. Fix: derive the branch from `inputs.change`, with a fallback for the
direct-`change/*`-branch case:

```yaml
- name: Checkout
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
    ref: ${{ inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref }}
```

- On `repository_dispatch` → `inputs.change` is set → checks out
  `refs/heads/change/<name>` (the human-pushed branch).
- If ever called on a `change/*` push with no input → falls back to `github.ref`.

The existing **"Resolve change name"** step already prefers `inputs.change`, so it
stays correct after this fix; do not change its logic. Its
`openspec/changes/${name}` existence check will now pass because the right branch is
checked out. Verify the step order: checkout → resolve → … (checkout must precede
resolve, as it does today).

> Optional hardening (not required): the backend also sends
> `client_payload.head_sha`. If you want determinism against concurrent pushes, add
> a `head_sha` input + caller passthrough and check out that SHA instead of the
> branch tip, pushing back with `HEAD:refs/heads/change/<name>`. Skip for now unless
> trivial.

### (B) Author commits as the Specfly bot — finishes a TODO
Current step:

```yaml
- name: Configure git identity
  run: |
    # TODO: once the Specfly App is registered, author commits as the App's
    # numeric bot identity (<id>+specfly[bot]@users.noreply.github.com).
    git config user.name "specfly[bot]"
    git config user.email "specfly[bot]@users.noreply.github.com"
```

Set the GitHub-canonical bot identity so the applied commits attribute to the
Specfly bot:

```yaml
- name: Configure git identity
  run: |
    # specfly[bot] = the registered Specfly App's bot account (user id 287375800).
    # Cosmetic attribution only — see notes below.
    git config user.name "specfly[bot]"
    git config user.email "287375800+specfly[bot]@users.noreply.github.com"
```

Notes you MUST encode in comments so nobody is misled:
- This is **cosmetic attribution only**. It does NOT make commits GPG-"Verified"
  (only API-authored commits are), and it does NOT change the webhook `sender`.
- The push is authenticated by `GITHUB_TOKEN`, so the backend always sees the
  result push as `sender == github-actions[bot]` — which is exactly what its
  result-detection keys on (see `briefing-build.md` §11.3). Do not try to make the
  push appear to come from `specfly[bot]`.
- The id `287375800` is the real, registered App bot id (fixed public value);
  hardcode it as shown — no placeholder/fill-in needed.

### (C) The push → PR-open handshake — mostly already correct, make it explicit
There is **no runner→backend callback**. The handshake is implicit: the runner
pushes the result, and the backend's `push` webhook handler opens the PR. The
existing final steps already satisfy this; your job is to confirm and document, not
to add a callback.

Confirm the **"Commit and push change branch"** step:
- Pushes to `change/<name>` via `GITHUB_TOKEN` (keep `actions/checkout`'s default
  `persist-credentials: true`; do not set a custom token).
- Commit subject is `opsx:apply <name>` — it MUST NOT start with `@specfly:apply`,
  or it would re-trigger a dispatch loop. (It currently does not — keep it that way.)
- Excludes the `apply.jsonl` audit log from the commit (it already does via
  `git reset -- apply.jsonl`).

Add a short comment making the handshake explicit, e.g.:
```
# This push (as github-actions[bot]) is the signal the backend waits for: its
# push webhook handler opens/updates the PR as Specfly[bot]. No callback needed.
```

---

## 3. Out of scope — do NOT change
- **Prerequisite policy (DESIGN §11.3, still OPEN):** the "Resolve package manager"
  hard-fail on non-pnpm/bun, and the OpenSpec requirement, stay exactly as they are.
  Whether to relax them is a separate, unsettled decision — do not touch this logic.
- The Claude invocation, model/effort inputs, log streaming, and artifact upload —
  leave as-is.
- `examples/adopter-workflow.yml` — it already maps `client_payload` → inputs
  correctly. Verify it still matches the inputs; change it only if you add a
  `head_sha`/`branch` input in the optional hardening (otherwise leave untouched).

---

## 4. Validation (required)
- **Lint:** run [`actionlint`](https://github.com/rhysd/actionlint) on
  `.github/workflows/apply.yml` and `examples/adopter-workflow.yml`; must be clean.
- **YAML/expression sanity:** confirm the `ref:` expression parses and the
  `inputs.change != '' && format(...) || github.ref` ternary is valid Actions
  syntax. (Actions evaluates `A && B || C` as a ternary.)
- A full live end-to-end run is gated on the App + backend existing, so it is a
  **manual test plan** (below), not something you execute now.

### Manual e2e test plan (document in a comment or PR description; maintainer runs later)
1. In a test adopter repo with the App installed + backend deployed + `main`
   protected: `git commit -m "@specfly:apply" && git push` on `change/<name>`.
2. Expect: backend `repository_dispatch` → this workflow runs → checks out
   `change/<name>` → `/opsx:apply` → pushes `opsx:apply <name>` commit.
3. Expect: backend opens a PR as `Specfly[bot]`; adopter CI triggers on it.
4. Confirm the dispatch did not loop (the runner's push has no `@specfly:apply`
   prefix and is by `github-actions[bot]`).

---

## 5. Acceptance criteria (the verifier will check these)
1. Checkout `ref:` targets `refs/heads/change/<inputs.change>` on dispatch, with the
   `github.ref` fallback; step order checkout→resolve preserved.
2. "Resolve change name" logic unchanged and still correct post-fix.
3. Commit identity set to `specfly[bot]` with email
   `287375800+specfly[bot]@users.noreply.github.com` (the real App bot id, hardcoded —
   no placeholder); comments state it is cosmetic and does not change the webhook sender.
4. Push step unchanged in substance: `GITHUB_TOKEN`, pushes `change/<name>`, subject
   `opsx:apply <name>` (no `@specfly:apply` prefix), `apply.jsonl` excluded; handshake
   documented with a comment; no runner→backend callback added.
5. Prerequisite/package-manager/OpenSpec logic untouched (§11.3 deferred).
6. `actionlint` clean on both workflow files.
7. Manual e2e test plan recorded.
8. `status.md` step 3 updated to reflect completion when done.

## 6. Guardrails / must-nots (recap)
- Don't relax prerequisites (§11.3 is unsettled).
- Don't add a runner→backend callback — the backend is push-webhook-driven.
- Don't make the result commit subject start with `@specfly:apply` (loop risk).
- Don't replace `GITHUB_TOKEN` with a PAT/App token for the push.
- Don't deploy or register anything.
