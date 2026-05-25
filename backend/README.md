# Specfly backend

The Specfly **control plane**: a single Cloudflare Worker that turns an adopter's
`@spec:apply` commit into a runner dispatch, then turns the runner's result into
a pull request authored by the `specfly[bot]` GitHub App. This is the whole reason
the App identity exists — an App-authored PR (or App push) is a distinct actor a
solo maintainer can approve **and** that re-fires the adopter's CI, neither of which
a `GITHUB_TOKEN`-authored PR/push can do.

It does exactly two jobs and nothing else: no dashboard, no UI, no OAuth, no
billing, no custody of adopter source or logs. The `installation` webhook is
acknowledged but no longer persisted — the install list is recoverable on demand
via the App API (`GET /app/installations`). What it does store in D1 is
**ephemeral, non-attributable** operational state: HMAC-keyed digests (no plaintext
repo/account/branch/change name), swept past a short TTL. See
`../openspec/_planning/HIGH-LEVEL-DESIGN.md` (§3, §4, §6, §7, §11) and
`briefing-build.md` for the authoritative design.

## Endpoints

| Route          | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `GET /`        | Health check → `200 specfly backend ok`. No DB, no secrets.        |
| `POST /webhook`| GitHub App webhook receiver. Verifies HMAC-SHA256 on the **raw** body before parsing; `401` on failure, fast `2xx` otherwise. |

On a `push` webhook the backend classifies the event (`src/logic.ts`):

- **trigger** — a human pushes a commit whose subject starts with `@spec:apply`
  to `change/<name>` → mint an installation token → fire a `repository_dispatch`
  (`event_type: specfly-apply`) → record a `dispatched` run.
- **result** — `github-actions[bot]` pushes back to `change/<name>` while a
  `dispatched` run exists → **atomically claim** the dispatched run, then (only if the
  claim won) open an App-authored PR (first apply), or push one empty CI-refresh commit
  as the App (re-run, PR already open). See *Supersede & the atomic result claim* below.
- **ignore** — everything else, including the App's own `specfly[bot]` CI-refresh
  push (so it can never loop).

## Layout

```
backend/
  package.json        wrangler.toml        tsconfig.json
  .dev.vars.example   # required secret names (no values); .dev.vars is gitignored
  migrations/0001_init.sql
  src/
    index.ts          # Hono app: POST /webhook, GET /, scheduled (cron TTL sweep)
    github.ts         # App init, token mint, dispatch/openPR/pushEmptyCommit
    state.ts          # HMAC key digests + RETENTION_DAYS (ephemeral state)
    handlers/push.ts          installation.ts (ack-only no-op)
    logic.ts          # PURE decision functions (unit-tested, no I/O)
    db.ts             # D1 query helpers (digest-keyed)
    types.ts          # Env bindings + shared types
  test/               # logic + signature + state + push-handler unit tests
```

## Tech & edge-compatibility

- **TypeScript (strict)** on **Cloudflare Workers**, router **Hono**, GitHub
  integration via **`@octokit/app`** (webhook verification through `app.webhooks`,
  per-request installation clients through `app.getInstallationOctokit(id)`).
- `wrangler.toml` sets **`compatibility_flags = ["nodejs_compat"]`**. The bundle
  actually builds clean with or without it (`@octokit/app` resolves crypto via Web
  Crypto, not `node:*` imports), but the flag is kept as a deliberate safety net:
  `wrangler deploy --dry-run` cannot exercise the runtime token-minting path (it
  needs the real App private key), and that path may touch Node globals such as
  `Buffer`. It is harmless to keep. If a future octokit bump fails to build,
  `briefing-build.md` §4 documents the lower-level fallback
  (`@octokit/webhooks-methods` + `@octokit/auth-app` + `@octokit/core`).

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars     # fill a throwaway WEBHOOK_SECRET + STATE_HMAC_KEY;
                                   # APP_ID/PRIVATE_KEY only needed for live GitHub calls
npm run migrate:local              # wrangler d1 migrations apply specfly --local
npm run dev                        # wrangler dev → GET / should return ok
```

Unit tests and the dry-run are sufficient without live App secrets:

```bash
npm test           # vitest: logic + signature + state-hashing + push handler (38 tests)
npm run typecheck  # tsc --noEmit
npm run deploy:dry # wrangler deploy --dry-run
```

## Contract with the runner (`apply.yml`)

> ⚠️ This backend builds the `client_payload` documented here; **wiring `apply.yml`
> to consume it is a separate task** (status.md step 3). Do not change `apply.yml`
> to satisfy this README.

`repository_dispatch` triggers the workflow **as defined on the default branch**,
and the run's `github.ref` is the **default branch** — not `change/<name>`. The
runner therefore cannot infer the change branch from the event, so the backend
passes it explicitly. On a trigger the backend fires:

```jsonc
{
  "event_type": "specfly-apply",
  "client_payload": {
    "change":   "<name>",          // OpenSpec change name
    "branch":   "change/<name>",   // branch the runner must check out
    "head_sha": "<trigger_sha>",   // the @spec:apply commit
    "model":    "<optional>",      // from `model=` on the trigger subject
    "effort":   "<optional>"       // from `effort=` on the trigger subject
  }
}
```

(`client_payload` is kept to ≤10 top-level keys — a GitHub limit.) The adopter's
thin caller workflow is `on: repository_dispatch` `types: [specfly-apply]` and maps
these fields onto the reusable `apply.yml` `workflow_call` inputs (`change`, `model`,
`effort`), checking out `client_payload.branch`. The runner pushes its result with
the subject `opsx:apply <name>` (no `@spec:apply` prefix) so it can never
re-trigger a dispatch.

## Ephemeral, non-attributable state

The control plane needs persisted state for exactly two short-lived jobs: dedup a
redelivered trigger, and correlate a later result push to an outstanding dispatch.
It deliberately keeps **no readable record** of who uses the tool or what they
applied — the trade-off is that the DB is no longer human-readable for incident
debugging (by design; debugging lives in the adopter's Actions logs).

- **HMAC-keyed digests, no plaintext.** The `runs` table stores only
  `trigger_key` = `HMAC(STATE_HMAC_KEY, "owner/repo\n<sha>")` (PRIMARY KEY, the
  dedup key) and `repo_branch_key` = `HMAC(STATE_HMAC_KEY, "owner/repo\nchange/<name>")`
  (the result-correlation key), plus `status` and `updated_at`. No repository,
  account, branch, change name, sha, or PR number is stored. Lookups recompute the
  digest from the live webhook payload — the plaintext is always in hand at decision
  time (`src/state.ts`).
- **No installations registry.** The `installations` table is gone; the
  `installation` webhook is acknowledged `2xx` but persists nothing. The install
  list is fetched on demand via `GET /app/installations`.
- **Bounded retention via a daily cron.** `wrangler.toml` declares
  `[triggers] crons = ["0 3 * * *"]`; the Worker's `scheduled` handler runs
  `deleteRunsOlderThan(DB, RETENTION_DAYS)` (default 7 days). The TTL sits well above
  the 3 h max in-flight apply time (`apply.yml` `timeout-minutes: 180`) and the
  realistic webhook-redelivery window. The delete is idempotent; a missed run only
  delays cleanup. Rotating `STATE_HMAC_KEY` orphans any in-flight digests, so rotate
  during a quiet window and let the short TTL self-heal.
- **No identifying data in logs.** Handlers log no repo/account identifiers.

## Known state: a dispatched run with no result

If a dispatched apply produces **no** result push — the apply made no changes, or
the runner job failed — the backend opens no PR and the `runs` row stays
`status="dispatched"`. The failure is visible in the adopter's own Actions run. Such
a row is no longer kept forever: the daily cron above deletes any `runs` row whose
`updated_at` ages past the retention TTL (`RETENTION_DAYS`, default 7), so this state
is self-reclaiming.

## Supersede & the atomic result claim

Two `@spec:apply` commits pushed to the same `change/<name>` branch in quick
succession each re-dispatch a fresh apply (by design — a new trigger sha re-dispatches).
Two layers keep this from racing:

- **Latest apply wins (the runner side).** The reusable `apply.yml` declares a
  **job-level `concurrency`** group keyed per change (`specfly-apply-${{ inputs.change }}`)
  with `cancel-in-progress: true`. All caller runs for one change share that group, so a
  newer apply **cancels the in-flight one before its push step** — the stale run never
  clobbers the branch, and the newest trigger is the one that pushes. The guard lives in
  the reusable workflow, so every adopter on `@v1` inherits it with no change to their
  copied caller.
- **The atomic result claim (this backend).** On a `result`, the handler first runs the
  single-statement claim `markRunPrOpened` —
  `UPDATE runs SET status='pr_opened' … WHERE repo_branch_key=? AND status='dispatched'` —
  and acts **only if it changed ≥ 1 row**. D1 serializes concurrent writers, so of two
  near-simultaneous (or a redelivered) `result` pushes, only one claims the branch and
  acts; the loser sees `0` rows changed and **no-ops** — no duplicate PR, no double
  CI-refresh commit. The claim *precedes* the GitHub call, closing the prior
  read→act→update window.

**Claim-then-action-failure orphan.** If the claim wins but the subsequent GitHub call
(open-PR / refresh) then throws (e.g. a GitHub 5xx), the row is left `pr_opened` with no
PR. A redelivery finds no `dispatched` run and no-ops, so it is not re-opened
automatically — but it is **recoverable**: a fresh `@spec:apply` (new sha) mints a new
dispatched run and re-opens, and the TTL sweep reclaims the orphan row. This is strictly
better than the prior act-then-mark ordering, whose mark-failure path could *double*-fire
the CI-refresh.

> **Maintainer note — the guard reaches adopters only when `@v1` moves.** Adopters
> reference `…/apply.yml@v1`, so the concurrency guard ships to them only once the **`v1`
> tag is moved** to include this change. Re-tag `@v1` after merge.
>
> The optional `head_sha` checkout hardening (`../openspec/_planning/briefing-wire.md`
> §2(A)) remains a **separate, independent** decision: under `cancel-in-progress` the
> superseded apply is cancelled before it checks out and pushes, so its concurrent-trigger
> race is moot here. Not bundled.

## Maintainer deploy runbook

> The maintainer runs this — it needs secrets they hold. **Do not run it as part of
> building the backend.** The GitHub App is already registered (App perms: Pull
> requests R/W, Contents R/W, Metadata R; events: Push, Pull request).

1. **Create the database** and copy the printed id into `wrangler.toml`'s
   `database_id`:
   ```bash
   wrangler d1 create specfly
   ```
2. **Apply migrations to the remote DB** — this applies `0001`, the first and only
   schema (nothing has been deployed, so there is no prior schema or data to migrate):
   ```bash
   wrangler d1 migrations apply specfly --remote
   ```
3. **Set the secrets** (never commit these):
   ```bash
   wrangler secret put APP_ID          # the App's numeric id
   wrangler secret put PRIVATE_KEY      # the App's PEM private key (paste whole file)
   wrangler secret put WEBHOOK_SECRET   # the App webhook signing secret
   # Generate a random key for the run-state digests, then set it:
   openssl rand -hex 32 | wrangler secret put STATE_HMAC_KEY
   ```
4. **Deploy** — the `[triggers] crons` daily TTL sweep ships with the Worker; the
   deploy output lists it under *Cron Triggers*:
   ```bash
   wrangler deploy
   ```
5. **Bind the route / custom domain** so `https://api.specfly.io/webhook` reaches
   the Worker, and set the GitHub App's webhook URL to it.
6. **Smoke test:** from the App's *Advanced* tab, redeliver a recent webhook and
   confirm a `2xx` (and a `401` for a deliberately corrupted signature).

Rollback: revert the Worker deploy. The D1 schema is additive and
create-if-not-exists, so no data migration is required.
