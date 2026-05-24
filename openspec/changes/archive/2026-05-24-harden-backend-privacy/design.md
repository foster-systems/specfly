## Context

The backend built under `build-backend` persists two D1 tables: an `installations`
registry and a `runs` table. Both store plaintext, human-readable identifiers
(`account_login`, `repo_full_name`, `branch`, `change_name`) and neither is ever
pruned, so over time the database becomes a growing "who runs Specfly and what they
applied" ledger. Yet the control plane only needs state for two narrow, short-lived
jobs: dedup a redelivered trigger, and correlate a later result push to an
outstanding dispatch. Everything else is archive. This change makes the persisted
state ephemeral and non-attributable while keeping those guarantees. Authoritative
background: `openspec/_planning/briefing-build.md` and `HIGH-LEVEL-DESIGN.md`.

## Goals / Non-Goals

**Goals:**
- The database holds no readable record of which accounts/repos use the tool or what
  they applied — only opaque, keyed digests.
- Storage is bounded: rows live roughly as long as they are operationally useful, then
  are swept.
- The three correctness properties are preserved verbatim: trigger dedup, result
  correlation, result-redelivery suppression.
- No identifying data is written to logs.

**Non-Goals:**
- No change to the trigger/result/ignore decision logic, the GitHub API calls, or the
  `client_payload` contract.
- No new GitHub permission; no App re-registration; no deploy or secret-setting (the
  maintainer's gated runbook).
- Not encrypting data for later decryption — we deliberately cannot read identifiers
  back; equality is all we need.
- No data migration of existing rows: nothing has ever been deployed and no D1 has
  ever been created, so the initial migration is rewritten in place rather than a
  forward migration added.

## Decisions

**HMAC-keyed identifiers, not plaintext or bare hashes.** The only operations on
stored identifiers are equality checks (dedup by trigger, correlate by repo+branch),
and the backend always has the plaintext from the live webhook payload at decision
time. So we store `HMAC-SHA256(STATE_HMAC_KEY, value)` and recompute the digest to
look up. Plaintext is rejected (it is the ledger we are removing). A bare SHA-256 is
rejected because repo names and branches are low-entropy and dictionary-reversible;
keying with a server secret defeats enumeration. Encryption is rejected because it is
reversible by design — we never need to read the value back.

**Two keys per run, derived from payload fields.**
- `trigger_key = HMAC(key, "owner/repo\n<trigger_sha>")` — PRIMARY KEY, the dedup key
  (replaces the old `UNIQUE(repo_full_name, trigger_sha)`).
- `repo_branch_key = HMAC(key, "owner/repo\nchange/<name>")` — indexed, the
  result-correlation key (replaces lookups by `(repo_full_name, branch)`).
Both inputs come straight from the push payload (`repository.full_name`,
`head_commit.id`, `ref`), so no plaintext is persisted to compute them.

**Slim the row to `{ trigger_key, repo_branch_key, status, updated_at }`.** Every
other column is dropped because nothing reads it back: `change_name` is re-derived via
`parseRef`, `pr_number` is re-discovered via `findOpenPr`, `installation_id` comes
from the payload, and `id`/`delivery_id` were audit-only. `status` stays
(`dispatched`|`pr_opened`) because the `dispatched → pr_opened` transition is what
makes result redelivery idempotent.

**Drop `installations`; the install webhook becomes an ack-only no-op.** The table
was write-only — the push payload carries `installation.id`, so nothing read it. The
install list is recoverable on demand via the App API (`GET /app/installations`), so
storing it buys nothing and is the main "which accounts run this" exposure. The
`installation` event is still acknowledged `2xx` (so GitHub records success) but
performs no persistence. The `installation-tracking` capability is retired.

**TTL cleanup via a Workers Cron Trigger.** D1 has no native row expiry, so a
`scheduled` handler runs `DELETE FROM runs WHERE updated_at < datetime('now', '-7
days')`. The TTL is a single tunable constant; 7 days sits well above the 3 h max
in-flight time (`apply.yml` `timeout-minutes: 180`) and the realistic
webhook-redelivery window. Delete-on-terminal is rejected — it would break
result-redelivery suppression (a redelivered result would re-open/refresh). This also
subsumes the previously out-of-scope "no-result run stays `dispatched`" cleanup.

**Dedicated `STATE_HMAC_KEY` secret.** A separate secret from `WEBHOOK_SECRET` keeps
purposes independent (rotating one must not affect the other) and keeps the keying
material out of the signature-verification path. It is a Workers secret like the
others — set via `.dev.vars` locally and `wrangler secret put` in production.

**Rewrite the initial migration; there is nothing to migrate from.** Nothing has ever
been deployed and no D1 has ever been created, so `migrations/0001_init.sql` is
rewritten in place to define the final slim, hashed `runs` table directly and to define
no `installations` table — rather than adding a `0002` that drops/replaces a prior
shape. There is no deployed schema, no data, and no in-flight runs to preserve, so no
forward migration is warranted; the build-backend schema only ever existed as a
local-dev artifact, which is reset before re-applying.

## Risks / Trade-offs

- **Key rotation invalidates in-flight digests** → a `STATE_HMAC_KEY` rotation orphans
  any `dispatched` run mid-handshake (its result would no longer correlate; a
  redelivered trigger could re-dispatch). *Mitigation:* rotate during a quiet window;
  the short TTL self-heals; document it as a rare maintainer action.
- **Redelivery after the TTL re-dispatches** → a manual redelivery older than 7 days
  would re-run an apply. *Mitigation:* TTL ≫ realistic redelivery window; accepted.
- **Loss of DB debuggability** → operators can no longer read the DB to see activity.
  *Mitigation:* by design; run-level debugging already lives in the adopter's Actions
  logs (a stated project principle).
- **Confirm-a-guess on HMAC** → someone holding `STATE_HMAC_KEY` and guessing a
  repo+sha could confirm a row exists. *Mitigation:* the key is a secret; low-value
  target; accepted.
- **Cron reliability on the free tier** → a missed scheduled run only delays cleanup;
  the delete is idempotent and not time-critical, so cadence (e.g. daily) is forgiving.

## Migration Plan

1. Rewrite `backend/migrations/0001_init.sql` in place: define the slim hashed `runs`
   table (`trigger_key` PRIMARY KEY, `repo_branch_key`, `status`, `updated_at`) plus the
   `repo_branch_key` index, and define no `installations` table. Do not add a `0002` —
   nothing has ever been deployed, so there is no prior schema to migrate from. For
   local dev, recreate the local D1 first (the old `0001` may already be recorded as
   applied, so an edit alone won't re-run — e.g. remove `.wrangler/state/v3/d1` or use a
   fresh local DB), then `wrangler d1 migrations apply specfly --local`.
2. Maintainer runbook additions (documented, not executed here): generate a random
   key and `wrangler secret put STATE_HMAC_KEY`; `wrangler d1 migrations apply specfly
   --remote` (the first and only schema apply — `0001`); `wrangler deploy` (the
   `[triggers] crons` schedule ships with the Worker). Rollback: revert the Worker
   deploy; the schema is create-if-not-exists and carries no data worth preserving.

## Open Questions

- Cron cadence: daily is the planned default (cleanup is not time-sensitive); revisit
  only if run volume ever makes a daily delete too large for one invocation.
