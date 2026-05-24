## Why

The backend's D1 currently keeps a growing, human-readable record of who uses
Specfly and what they apply: an `installations` registry (account login/type) plus
per-run rows carrying `repo_full_name`, `branch`, `change_name`, and `pr_number`
that are never deleted. For a control plane whose only real need is short-lived
operational state (dedup a redelivered trigger, correlate a result push to an
outstanding dispatch), that is both an unnecessary privacy exposure — a readable
"which repos run this and what they did" ledger — and an unbounded archive. The
state should be **ephemeral** and **non-attributable** without losing those
correctness guarantees.

## What Changes

- **Rewrite the initial schema (nothing has ever been deployed).** Rewrite
  `migrations/0001_init.sql` in place so the initial schema defines `runs` directly in
  the slimmed, hashed-key shape: `repo_branch_key` = `HMAC(STATE_HMAC_KEY, "owner/repo\nchange/<name>")`,
  `trigger_key` (PRIMARY KEY) = `HMAC(STATE_HMAC_KEY, "owner/repo\n<sha>")`, `status`
  (`dispatched`|`pr_opened`), `updated_at`. It omits the build-backend `id`,
  `repo_full_name`, `branch`, `change_name`, `trigger_sha`, `pr_number`, `delivery_id`,
  `installation_id` columns — none are read back (change is re-derived from the ref, PR
  re-found via `findOpenPr`, installation id taken from the payload). No `0002`
  migration is added: no D1 has ever been created, so there is no prior schema to
  migrate from.
- **Define no `installations` table** (the rewritten `0001` simply omits it) and make
  the `installation` webhook an ack-only `2xx` no-op. The install list is recoverable on demand via the App API
  (`GET /app/installations`), so nothing recoverable is lost. Retire the
  `installation-tracking` capability.
- Add a dedicated **`STATE_HMAC_KEY`** secret (Web Crypto HMAC — the same edge-safe
  primitive already used for signature verification) used only to key the stored
  digests; list it in `.dev.vars.example` and the deploy runbook.
- Add a Cloudflare Workers **Cron Trigger** (`scheduled` handler + `[triggers] crons`
  in `wrangler.toml`) that deletes `runs` rows older than a tunable TTL
  (default **7 days**), so storage tracks recent activity rather than cumulative
  applies. The TTL sits comfortably above the 3 h max in-flight time
  (`apply.yml` `timeout-minutes: 180`) and the realistic webhook-redelivery window,
  and it auto-cleans the previously-unbounded "no-result run stays `dispatched`" state.
- Scrub repo/account identifiers out of any Worker logs.

Correctness is preserved: trigger dedup (unique `trigger_key`), result correlation
(a `dispatched` row for `repo_branch_key`), and result-redelivery suppression
(`dispatched → pr_opened`) all recompute their keys from the live webhook payload —
no plaintext needs to be stored. Accepted cost: the DB is no longer human-readable
for incident debugging (by design); debugging stays in the adopter's Actions logs.

## Capabilities

### New Capabilities
- `ephemeral-state`: Non-attributable, bounded persistence for the control plane —
  HMAC-keyed identifiers (no plaintext repo/account/change name stored), a scheduled
  TTL cleanup that removes aged `runs` rows, and a prohibition on writing identifying
  data to logs.

### Modified Capabilities
- `apply-dispatch`: "Run recording and idempotency" records a hashed `trigger_key` /
  `repo_branch_key` row (`status` + `updated_at`) instead of plaintext
  repo/sha/branch/delivery columns; the unique `trigger_key` is the dedup key.
- `pr-authoring`: PR-open and CI-refresh update the slimmed run row by its hashed key
  (status only — no `pr_number` is stored); "No-result runs remain dispatched" is now
  bounded — such rows are removed by the `ephemeral-state` TTL cleanup.
- `webhook-gateway`: the `installation` event is acknowledged with `2xx` but performs
  no persistence (ack-only); routing otherwise unchanged.
- `installation-tracking`: **REMOVED** — both requirements retired; no installation
  registry is persisted.

## Impact

- **Code:** `backend/migrations/0001_init.sql` (rewritten in place: no `installations`
  table; `runs` defined directly in the hashed shape), `src/types.ts` (`Env` gains `STATE_HMAC_KEY`; slim run
  type), `src/db.ts` (hashed-key helpers; remove installation helpers + unused
  columns), `src/state.ts` or a hashing helper (`hashKey`), `src/handlers/push.ts`
  (compute hashed keys for lookups/inserts), `src/handlers/installation.ts` (reduced
  to ack/no-op), `src/index.ts` (add `scheduled` handler; installation route
  ack-only), `backend/wrangler.toml` (`[triggers] crons`).
- **Config/secrets:** new `STATE_HMAC_KEY` (local `.dev.vars`; prod `wrangler secret
  put`). No data migration: nothing has ever been deployed and no D1 has been created,
  so the initial migration is rewritten to the final shape — there is no prior schema
  or rows to migrate from.
- **Docs:** `backend/README.md` (new secret, cron/TTL note, revised known-state
  wording, updated runbook).
- **Out of scope (unchanged):** no deploy, no secret-setting, no App re-registration
  — that remains the maintainer's gated runbook. No new GitHub permission.
