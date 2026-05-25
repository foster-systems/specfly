# Briefing — first live `@spec:apply` end-to-end test

The one path the deploy smoke test **couldn't** reach: a real human `@spec:apply`
push → backend mints an installation token → `repository_dispatch` → the runner
applies and pushes → backend opens an **App-authored PR**. This is what validates
`APP_ID` / `PRIVATE_KEY` token-minting in production.

Current prod state (from STATUS.md): Worker live at `https://api.specfly.io/webhook`,
Version `3b375d3a` (matches `MARKER = "@spec:apply"`), `v1` → `f091035`, cron daily.
You operate in **two places**: the **adopter test repo** (where you push) and this
**specfly `backend/`** dir (where you watch logs / D1).

## The hop chain you're verifying

1. **Trigger** — human pushes a commit, subject starts `@spec:apply`, to
   `change/<name>` in the adopter repo. Sender ≠ `github-actions[bot]`.
2. **Dispatch** — backend `classifyPush` → `trigger`; mints token; fires
   `repository_dispatch` (`event_type: specfly-apply`, `client_payload`:
   `change`, `branch`, `head_sha`, optional `model`/`effort`); inserts a
   `dispatched` run (digest-keyed). _(src/handlers/push.ts:56-81)_
3. **Apply** — adopter's caller workflow (`on: repository_dispatch` `types:
   [specfly-apply]`) calls `…/apply.yml@v1`; checks out `head_sha` **detached**;
   `/opsx:apply <name>` runs; commits + pushes to `change/<name>` with subject
   **`opsx:apply <name>`** via `GITHUB_TOKEN` (sender `github-actions[bot]`).
4. **PR** — backend sees the result push (sender `github-actions[bot]` + a
   `dispatched` run exists) → atomic claim `markRunPrOpened` → no open PR found →
   opens App-authored PR **"Apply &lt;name&gt;"** as `specfly[bot]`.
   _(src/handlers/push.ts:84-112)_
5. **CI re-fires** — because the PR is authored by a distinct actor (the App),
   not `GITHUB_TOKEN`, the adopter's PR checks actually run.

## Prerequisites — verify before pushing

In the **adopter test repo**:

- [ ] **Specfly App installed** on the repo (bot `287375800`). App perms: PRs
      R/W, Contents R/W, Metadata R; events: Push, Pull request.
- [ ] **Caller workflow on the _default_ branch** at `.github/workflows/specfly.yml`
      — a copy of `examples/adopter-workflow.yml`. ⚠️ `repository_dispatch` only
      triggers a workflow that exists **on the default branch**, so this file must
      be committed to `main`, not just the change branch.
- [ ] **`ANTHROPIC_API_KEY`** repo secret set (the reusable workflow fails fast
      without it).
- [ ] **An OpenSpec change** committed on branch `change/<name>`: the dir
      `openspec/changes/<name>/` must exist on the sha you push (the runner errors
      `No directory found at openspec/changes/<name>/` otherwise). Pick a tiny,
      safe change for the first run.
- [ ] (Recommended) **protected `main`** (see `docs/protect-main.md`) so the apply
      lands via PR, never direct to main.

If the test repo isn't set up yet, that setup **is** step 0 — do it first.

## Run it

From the adopter repo, on the change branch:

```bash
git checkout change/<name>          # branch must carry openspec/changes/<name>/
git commit --allow-empty -m "@spec:apply <name>"   # or: @spec:apply <name> model=opus effort=high
git push origin change/<name>
```

Notes:
- The **first line** of the subject must start with `@spec:apply` (case-sensitive,
  leading whitespace trimmed). `model=`/`effort=` tokens are optional. _(logic.ts)_
- It must be **your** push (a human), not `github-actions[bot]`.
- `--allow-empty` is fine — the trigger is the subject, not a diff.

## Watch each hop

- **Webhook received** — GitHub App → *Advanced* → *Recent Deliveries*: the `push`
  delivery should be `202`. (A `401` = signature/secret problem.)
- **Backend logs** — from `backend/`: `npx wrangler tail`. ⚠️ By design the handlers
  log **no repo/account identifiers** (privacy), so tail is sparse — it's mainly for
  spotting **errors** (token-mint 403, GitHub API failures), not tracing.
- **Dispatch landed** — adopter repo → Actions tab: a **"Specfly Apply"** run
  triggered by `repository_dispatch`. Open it and confirm the **Checkout** step
  resolved to `change/<name>` / the `head_sha`, **not** the default branch.
- **Result push** — the run's "Commit and push" step pushes `opsx:apply <name>` to
  `change/<name>`.
- **PR opened** — a PR titled **"Apply &lt;name&gt;"**, author **`specfly[bot]`**,
  body "Applied by Specfly via `/opsx:apply`…", with checks running.
- **State** — from `backend/`:
  `npx wrangler d1 execute specfly --remote --command "SELECT status, updated_at FROM runs ORDER BY updated_at DESC LIMIT 5"`.
  Expect a row transition `dispatched` → `pr_opened`. (Digests only — you can't see
  which repo; status + time is the signal.)

## Pass criteria

- [ ] Push delivery `202`; a "Specfly Apply" Actions run appears.
- [ ] Checkout on `change/<name>` (not default branch).
- [ ] Result commit `opsx:apply <name>` pushed by `github-actions[bot]`.
- [ ] App-authored PR "Apply &lt;name&gt;" opened by `specfly[bot]`.
- [ ] Adopter CI runs **on the PR**.
- [ ] **No dispatch loop** — the result push and any `chore: re-run CI` commit do
      **not** spawn a second apply run.
- [ ] D1 row `pr_opened`.

## If it stalls — triage by where

| Stuck at | Likely cause | Fix |
|---|---|---|
| No `202` (or `401`) on the push delivery | webhook secret mismatch / App webhook URL wrong | re-check `WEBHOOK_SECRET`; App webhook URL = `https://api.specfly.io/webhook` |
| `202` but no Actions run | caller workflow not on **default** branch, or `types:` ≠ `[specfly-apply]` | commit `specfly.yml` to `main`; fix the type |
| Run fails immediately | `ANTHROPIC_API_KEY` not set/passed | set the repo secret; caller passes it under `secrets:` |
| Run errors "No directory … openspec/changes/<name>" | change dir absent on the pushed sha | ensure `openspec/changes/<name>/` is committed on `change/<name>` |
| Run pushed result, no PR | GitHub 5xx during open-PR (claim won, row left `pr_opened` orphan), **or** a PR was already open (then it pushes `chore: re-run CI` instead) | check `wrangler tail` for the API error; orphan is recoverable via a fresh `@spec:apply` and TTL-swept |
| No trigger at all | subject didn't start `@spec:apply`, branch not `change/*`, or pushed as a bot | re-push a human commit with the correct subject to `change/<name>` |
| Dispatched, never a result | apply made no changes or the job failed | check the adopter Actions run; row stays `dispatched`, TTL-swept (7 d) |

## Notes

- **Re-apply** (second `@spec:apply`, new sha) on the same branch with the PR
  already open → backend pushes one empty `chore: re-run CI` commit (no duplicate
  PR). Both `opsx:apply` and `chore: re-run CI` classify as `ignore`, so neither
  loops. _(src/github.ts:91-134)_
- The D1 `runs` row is TTL-swept after `RETENTION_DAYS` (7) by the daily cron — no
  manual cleanup needed.
- Deeper rationale: `briefing-build.md` (§ flow, idempotency), `briefing-wire.md`
  (handshake), and the manual e2e header in `.github/workflows/apply.yml`.
