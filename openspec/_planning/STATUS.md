# Specfly — status & pickup

_Last updated: 2026-05-24._

Short "start here." Rationale in [HIGH-LEVEL-DESIGN.md](HIGH-LEVEL-DESIGN.md);
per-task detail in the briefings.

## Done

- **Backend built + privacy-hardened** (`backend/`) — Hono Worker: `POST /webhook`
  (raw-body HMAC → classify push → dispatch / open PR / CI-refresh) and `GET /`.
  State is HMAC-keyed digests only (no plaintext repo/branch/sha), TTL-swept by a
  daily cron; no `installations` table. `tsc` clean, vitest **38** green, dry-run
  builds. _(changes `build-backend`, `harden-backend-privacy` — archived.)_
- **Concurrency + atomic claim** _(change `supersede-concurrent-applies` — archived)_
  — `apply.yml` has a job-level `concurrency` guard (latest-wins, `cancel-in-progress`);
  the result path atomically claims the dispatched run before acting, so a losing/
  redelivered result can't double-open a PR or double-fire the CI-refresh commit.
- **GitHub App `specfly` registered** — bot id **287375800**
  (`287375800+specfly[bot]@users.noreply.github.com`); App ID / private key / webhook
  secret held by the maintainer for deploy.
- Naming, identities (npm/domain/repo), predecessor `remcc` deprecated, scaffold +
  briefings + ruleset guide.

## Pick up here (in order)

1. **Finish wiring `apply.yml`** — per [briefing-wire.md](briefing-wire.md). It's
   scaffolded + carries the concurrency guard, but open items remain: commit as the
   bot identity (App id 287375800 — TODO still at `apply.yml:134`), optional `head_sha`
   checkout (§2A), and verify reporting (§5).
2. **Deploy the backend** (maintainer; runbook in `backend/README.md`):
   `wrangler d1 create` → migrations → `wrangler secret put` APP_ID / PRIVATE_KEY /
   WEBHOOK_SECRET / STATE_HMAC_KEY → `wrangler deploy` → point `api.specfly.io/webhook`
   + the App's webhook URL at it → redeliver a webhook to smoke-test.
3. **Cut & tag `v1`** so `uses: …/apply.yml@v1` resolves (adopters reference `@v1`,
   not a sha). The concurrency guard reaches adopters only once `v1` includes it —
   move/re-tag `v1` after the supersede change.

## Pointers

- briefings: [briefing-build.md](briefing-build.md), [briefing-wire.md](briefing-wire.md),
  [briefing-apply-concurrency.md](briefing-apply-concurrency.md); ruleset:
  `docs/protect-main.md`
- App bot: `287375800+specfly[bot]@users.noreply.github.com`
- predecessor (deprecated): `foster-systems/remcc`; domain `specfly.io`
