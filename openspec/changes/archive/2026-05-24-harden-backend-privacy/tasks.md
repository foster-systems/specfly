## 1. Schema & config

- [x] 1.1 Rewrite `backend/migrations/0001_init.sql` in place to the final shape: define no `installations` table, and define `runs` directly as the slim hashed shape — `trigger_key TEXT PRIMARY KEY`, `repo_branch_key TEXT NOT NULL`, `status TEXT NOT NULL`, `updated_at TEXT NOT NULL DEFAULT (datetime('now'))` — plus `CREATE INDEX idx_runs_branch ON runs(repo_branch_key, status)`. Do not add a `0002` migration: nothing has ever been deployed, so there is no prior schema or data to migrate from
- [x] 1.2 Recreate the local D1 first (the old `0001` may already be recorded as applied, so an edit alone won't re-run — e.g. remove `.wrangler/state/v3/d1` or use a fresh local DB), then apply locally: `wrangler d1 migrations apply specfly --local` (confirm it applies cleanly)
- [x] 1.3 Add `STATE_HMAC_KEY` (no value) to `backend/.dev.vars.example`
- [x] 1.4 Add `[triggers] crons = ["0 3 * * *"]` (daily) to `backend/wrangler.toml`

## 2. Hashing helper & types

- [x] 2.1 `src/types.ts` — add `STATE_HMAC_KEY: string` to `Env`; replace `RunRow` with the slim shape `{ trigger_key, repo_branch_key, status, updated_at }` and drop the removed fields/`RunStatus` references no longer used
- [x] 2.2 Add `src/state.ts` — `hashKey(secret, value): Promise<string>` (Web Crypto HMAC-SHA256 → hex), plus `triggerKey(secret, repoFullName, sha)` and `repoBranchKey(secret, repoFullName, branch)` joining parts with `"\n"`; export a single `RETENTION_DAYS = 7` constant

## 3. Data layer

- [x] 3.1 `src/db.ts` — rewrite run helpers to key off digests: `findRunByTriggerKey`, `findDispatchedRunByRepoBranchKey`, `insertRun({ triggerKey, repoBranchKey })` (status `dispatched`), `markRunPrOpened(repoBranchKey)` (set `status='pr_opened'`, bump `updated_at`); remove `upsertInstallation`/`deleteInstallation` and every plaintext column
- [x] 3.2 Add `deleteRunsOlderThan(db, days)` — `DELETE FROM runs WHERE updated_at < datetime('now', ?)` with `'-<days> days'`

## 4. Handlers

- [x] 4.1 `src/handlers/push.ts` — compute `triggerKey`/`repoBranchKey` from the payload + `env.STATE_HMAC_KEY`; use them for the dedup lookup, the dispatched-run lookup, the insert, and the PR-open/refresh status update; store no plaintext and log no repo/account identifiers
- [x] 4.2 `src/handlers/installation.ts` — reduce to an ack-only no-op (no DB writes); remove the upsert/delete logic

## 5. Worker entry & cron

- [x] 5.1 `src/index.ts` — route `installation` to a `2xx` ack with no persistence; keep `POST /webhook` + `GET /`
- [x] 5.2 Convert the default export to module format `{ fetch: app.fetch, scheduled }` and implement `scheduled(event, env, ctx)` to call `deleteRunsOlderThan(env.DB, RETENTION_DAYS)`

## 6. Tests

- [x] 6.1 `test/signature.test.ts` — add `STATE_HMAC_KEY` to the test `env`; confirm accept/reject still pass
- [x] 6.2 `test/state.test.ts` — `hashKey`/`triggerKey`/`repoBranchKey` are deterministic, key-sensitive (different secret → different digest), output is hex only (no plaintext leak), and the two key builders are distinct for the same repo
- [x] 6.3 `vitest` passes (existing `logic.test.ts` is unchanged and still green)

## 7. Edge-compatibility proof

- [x] 7.1 `tsc --noEmit` passes
- [x] 7.2 `wrangler deploy --dry-run` succeeds (cron trigger recognized; note any flag) — dry-run validates the `[triggers] crons` config without error; `wrangler dev` confirmed the `scheduled` handler is recognized (printed the manual-trigger note). Cron triggers are echoed only on a real `wrangler deploy`, not in `--dry-run`
- [x] 7.3 `wrangler dev` boots and `GET /` returns ok
- [x] 7.4 Verify the TTL sweep against local D1: insert a row with an aged `updated_at` and a recent one via `wrangler d1 execute specfly --local`, run the `deleteRunsOlderThan` query, and confirm only the aged row is removed

## 8. Docs & final check

- [x] 8.1 `backend/README.md` — add `STATE_HMAC_KEY` to the secrets list and local-dev steps; document the cron/TTL retention behavior; revise the no-result known-state note (now bounded by the TTL); note the `installations` table is removed and the install list is fetched on demand via `GET /app/installations`
- [x] 8.2 Update the deploy runbook: generate a random key and `wrangler secret put STATE_HMAC_KEY`; apply migration `0001` remotely (the first and only schema apply); confirm the cron schedule ships with `wrangler deploy`
- [x] 8.3 Final check: no new GitHub permission; no plaintext identifiers stored or logged; `runs` matches the slim hashed shape; `installations` gone
