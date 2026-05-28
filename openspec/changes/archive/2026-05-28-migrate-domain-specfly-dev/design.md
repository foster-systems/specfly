## Context

Specfly's control-plane Worker is served at the custom domain `api.specfly.io` and the
GitHub App's webhook URL points at `https://api.specfly.io/webhook`. The host is
configured in two places that must agree: the Cloudflare Worker route
(`backend/wrangler.toml`, `custom_domain = true`) and the GitHub App's Webhook URL
setting. The host appears nowhere in the Worker's *behavior* — signature verification is
HMAC over the raw body, routing keys off the `x-github-event` header — so the current
`webhook-gateway` spec never names it. This change codifies that ingress contract as a new
`webhook-gateway` requirement; no existing requirement's behavior changes.

`specfly.dev` was purchased 2026-05-25 to drop the `fly.io` association. One adopter
(`foster-systems/foster-systems`) is installed and live, so its push deliveries must not
drop during the move. The migration is half repository change (config + docs + a test
string) and half maintainer-run infrastructure (Cloudflare zone, DNS/TLS, App setting)
that the agent cannot perform.

## Goals / Non-Goals

**Goals:**
- Serve the Worker at `api.specfly.dev` and repoint the GitHub App webhook URL to it.
- Zero dropped deliveries for the installed adopter across the cutover.
- Repository references (`wrangler.toml`, `backend/README.md`, the signature test,
  active planning briefings) name `specfly.dev`.

**Non-Goals:**
- No Worker behavior change — no code in `src/` changes; only config, docs, and one test
  string.
- No landing page or branding work — that is R2.
- No rewriting of `archive/**` audit trail (the historical `specfly.io` references stay).
- Not retiring the `specfly.io` registration in this change — it is kept resolving as the
  safety net; decommissioning it is a later, separate cleanup.

## Decisions

**Decision: Add the new route before removing the old; cut over via the App URL.**
The repository change flips `pattern = "api.specfly.io"` → `"api.specfly.dev"`. But the
real cutover sequence (maintainer) is additive-first:
1. Create the `specfly.dev` zone on the Cloudflare account (DNS hosted there) so
   `custom_domain = true` can auto-provision the record + TLS cert.
2. Deploy the Worker with the `api.specfly.dev` route. While `specfly.io` DNS still
   resolves and the App still points at the old URL, deliveries keep flowing to the old
   host — nothing has moved yet.
3. Confirm `https://api.specfly.dev/webhook` is reachable (TLS valid; `GET /` → `200`).
4. Repoint the GitHub App Webhook URL to `https://api.specfly.dev/webhook`. This is the
   atomic cutover — GitHub starts signing deliveries to the new host.
5. Smoke-test: redeliver a recent webhook from the App's *Advanced* tab → expect `2xx`,
   and a corrupted-signature delivery → `401`.

*Alternative considered — flip the route in place (remove old, add new in one deploy):*
rejected because between the deploy and the App-URL repoint, GitHub would still be
sending to `api.specfly.io`, which would 5xx/timeout if its route were gone — exactly the
dropped-delivery window we want to avoid.

**Decision: Keep `specfly.io` resolving until the App URL is repointed.** The single
ordering invariant that protects the adopter: the old host must keep answering until step
4 completes. After step 4, `specfly.io` can be left in place indefinitely as a cheap
safety net; its removal is out of scope here.

**Decision: Update the signature test string even though it is cosmetic.** The HMAC is
computed over the body, so the request URL in `signature.test.ts` does not affect the
assertion. Updating `https://api.specfly.io/webhook` → `…specfly.dev…` keeps the fixtures
honest and avoids a stale-string grep hit; no test logic changes.

**Decision: Update active docs, leave the archive alone.** `backend/README.md` and the
live planning briefings (`briefing-build.md`, `briefing-first-live-apply.md`,
`HIGH-LEVEL-DESIGN.md`) are forward-looking and get the new host.
`openspec/changes/archive/**` and `_planning/archive/STATUS.md` are the historical record
and are left verbatim, consistent with how the trigger-prefix rename (R8) treated the
archive.

## Risks / Trade-offs

- **TLS cert not yet issued when the App URL is repointed** → deliveries fail at the new
  host. Mitigation: step 3 explicitly verifies `api.specfly.dev` serves valid TLS and a
  `200` health check *before* step 4 repoints the App.
- **Zone not added to Cloudflare before deploy** → `custom_domain = true` cannot
  provision and the deploy errors. Mitigation: step 1 (create zone) gates step 2.
- **Wrangler route flip deployed while App still points at the old host** → only a risk if
  the old route is *removed*; the additive-first sequence keeps the old host answering, so
  the in-repo `pattern` change is harmless until the App is repointed.
- **Stale `specfly.io` references left in active docs** → confusion, not breakage.
  Mitigation: `git grep -i 'specfly\.io'` after the doc edits; only archive hits should
  remain.

## Migration Plan

Repository (this change, agent): flip `wrangler.toml` route + comment, update
`backend/README.md`, `signature.test.ts`, and the active briefings; `tsc` + vitest green;
`git grep -i specfly\.io` shows only archive hits.

Infrastructure (maintainer, runbook in tasks): zone → deploy → verify new host → repoint
App URL → smoke-test, per the ordered steps above.

Rollback: repoint the GitHub App Webhook URL back to `https://api.specfly.io/webhook`
(old host still resolving) and revert the `wrangler.toml` deploy. No data migration — D1
is untouched.

## Open Questions

- None blocking. Decommissioning the `specfly.io` registration (and its Cloudflare zone)
  is deferred to a later cleanup once `specfly.dev` has been stable for a while.
