## 1. Scaffold backend project

- [x] 1.1 Create `backend/` with the §5 layout (`src/`, `src/handlers/`, `migrations/`, `test/`)
- [x] 1.2 Add `backend/package.json` with deps `hono`, `@octokit/app` and dev deps `wrangler`, `typescript`, `vitest` (optionally `@cloudflare/vitest-pool-workers`); pin versions you verify
- [x] 1.3 Add `backend/tsconfig.json` (strict, ESNext modules, Workers types)
- [x] 1.4 Add `backend/wrangler.toml` with `name`, `main`, `compatibility_date`, and the `[[d1_databases]]` `DB` binding with a `database_id` placeholder
- [x] 1.5 Add `backend/.dev.vars.example` listing `APP_ID`, `PRIVATE_KEY`, `WEBHOOK_SECRET` (no values)
- [x] 1.6 Add `backend/.dev.vars` and `backend/.wrangler/` to the repo `.gitignore`
- [x] 1.7 `npm install` in `backend/`

## 2. Data layer

- [x] 2.1 Write `backend/migrations/0001_init.sql` matching §7 (`installations`, `runs`, unique index `(repo_full_name, trigger_sha)`, branch index)
- [x] 2.2 Apply locally: `wrangler d1 migrations apply specfly --local` (confirm it applies cleanly)
- [x] 2.3 Add `src/types.ts` — `Env` binding `DB: D1Database` + `APP_ID`/`PRIVATE_KEY`/`WEBHOOK_SECRET` strings, plus shared payload/run types
- [x] 2.4 Add `src/db.ts` — D1 helpers: upsert/delete installation; insert run; find run by `(repo, trigger_sha)`; find dispatched run by `(repo, branch)`; update run status/pr_number

## 3. Pure decision logic (unit-tested core)

- [x] 3.1 `parseRef(ref)` → `{ branch, changeName } | null` for `refs/heads/change/*`
- [x] 3.2 `isTriggerCommit(firstLine)` → starts with `@specfly:apply` (trim leading whitespace, case-sensitive)
- [x] 3.3 `parseApplyArgs(firstLine)` → `{ model?, effort? }`, ignore unknown keys
- [x] 3.4 `classifyPush(payload, hasDispatchedRun)` → `"trigger" | "result" | "ignore"` per §11.2/§11.3 (human+marker = trigger; `github-actions[bot]`+dispatched = result; `specfly[bot]`/everything else = ignore)

## 4. GitHub App integration

- [x] 4.1 `src/github.ts` — init `App` from env; `getInstallationOctokit(id)` token mint (never stored)
- [x] 4.2 `dispatch(octokit, repo, payload)` — `POST …/dispatches` `event_type: specfly-apply` with `client_payload` `{ change, branch, head_sha, model?, effort? }` (≤10 keys)
- [x] 4.3 `findOpenPr(octokit, repo, head)` and `openPullRequest(octokit, …)` — §11.3 PR body/title, `base = default_branch`, `draft: false`
- [x] 4.4 `pushEmptyCommit(octokit, repo, branch)` — Git Data API per §11.5 (read ref → read commit tree → create same-tree commit `chore: re-run CI` → fast-forward PATCH ref, no force)

## 5. Webhook gateway + handlers

- [x] 5.1 `src/index.ts` — Hono app; `GET /` → `200 specfly backend ok` (no DB, no secrets)
- [x] 5.2 `POST /webhook` — read raw body text, verify HMAC-SHA256 before parsing; `401` on failure (do nothing else)
- [x] 5.3 Route on `x-github-event`: `push`/`installation` to handlers, else `2xx`-and-ignore; respond prompt `2xx` when handled
- [x] 5.4 `src/handlers/push.ts` — call `classifyPush`; on `trigger` run §11.2 (idempotency check → mint → dispatch → insert `dispatched` run); on `result` run §11.3 (find open PR → open PR + update `pr_opened`, or push empty CI-refresh commit + touch `updated_at`); on `ignore` no-op
- [x] 5.5 `src/handlers/installation.ts` — upsert on `created`/`added`/`new_permissions_accepted`, delete on `deleted`, respond `2xx`

## 6. Tests

- [x] 6.1 `test/logic.test.ts` — `parseRef`, `isTriggerCommit`, `parseApplyArgs`, and `classifyPush` across trigger/result/ignore (incl. the `specfly[bot]` CI-refresh = ignore case)
- [x] 6.2 Signature test — valid `sha256=` HMAC of a fixture is accepted; flipped byte / bad signature is rejected (`401`)
- [x] 6.3 `vitest` passes

## 7. Edge-compatibility proof

- [x] 7.1 `tsc --noEmit` passes
- [x] 7.2 `wrangler deploy --dry-run` succeeds; if `node:*` errors appear, add `compatibility_flags = ["nodejs_compat"]` and bump `compatibility_date` (or switch to the fallback octokit packages)
- [x] 7.3 `wrangler dev` boots and `GET /` returns ok; record any `nodejs_compat` flag used

## 8. Docs & status

- [x] 8.1 `backend/README.md` — local dev (§15) + maintainer deploy runbook (§16) + the no-result known-state note (§11.3)
- [x] 8.2 Document the `client_payload` contract with `apply.yml` (§12) in the README; do NOT modify `apply.yml`
- [x] 8.3 Update `status.md` step 2 to reflect backend complete (builds, typechecks, tests pass, dry-run deploys)
- [x] 8.4 Final check against §17 acceptance criteria — no secrets committed, no permission beyond the three in §10, no dashboard/billing/OAuth code
