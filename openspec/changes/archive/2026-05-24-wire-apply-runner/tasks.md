## 1. Fix the checkout (correctness)

- [x] 1.1 In `.github/workflows/apply.yml`, change the Checkout step's `ref:` from `${{ github.ref }}` to `${{ inputs.change != '' && format('refs/heads/change/{0}', inputs.change) || github.ref }}`, keeping `fetch-depth: 0`.
- [x] 1.2 Confirm step order is unchanged: Checkout precedes "Resolve change name"; do not modify the resolve step's logic.

## 2. Author commits as the Specfly bot

- [x] 2.1 In the "Configure git identity" step, set `user.email` to `287375800+specfly[bot]@users.noreply.github.com` (hardcoded App bot id) and keep `user.name "specfly[bot]"`; remove the old TODO comment.
- [x] 2.2 Add comments stating the attribution is cosmetic only — it does not make commits GPG-"Verified" and does not change the webhook `sender` (the `GITHUB_TOKEN` push stays `github-actions[bot]`, which the backend's result-detection keys on).

## 3. Document the push → PR-open handshake

- [x] 3.1 In "Commit and push change branch", add a comment making the implicit handshake explicit: this push (as `github-actions[bot]`) is the signal the backend's push webhook uses to open/update the PR as `Specfly[bot]`; no runner → backend callback.
- [x] 3.2 Verify (do not change substance): push via `GITHUB_TOKEN` with checkout's default `persist-credentials: true`, commit subject `opsx:apply <name>` (no `@specfly:apply` prefix), and `apply.jsonl` excluded via `git reset -- apply.jsonl`.

## 4. Verify out-of-scope code is untouched

- [x] 4.1 Confirm the "Resolve package manager" hard-fail and the OpenSpec prerequisite logic are unchanged (DESIGN §11.3 deferred).
- [x] 4.2 Confirm the Claude invocation, model/effort inputs, log streaming, and artifact upload are unchanged.
- [x] 4.3 Confirm `examples/adopter-workflow.yml` still maps `client_payload` → inputs and leave it untouched (no `head_sha` hardening this change).

## 5. Validate and record

- [x] 5.1 Run `actionlint` on `.github/workflows/apply.yml` and `examples/adopter-workflow.yml`; ensure both are clean.
- [x] 5.2 Confirm the `ref:` ternary expression parses as valid Actions syntax (`A && B || C`).
- [x] 5.3 Record the manual e2e test plan (in a workflow comment or PR description) for the maintainer to run once the App + backend exist.
- [x] 5.4 Update `openspec/_planning/STATUS.md` step 3 to reflect completion of the `apply.yml` wiring.
