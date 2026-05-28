## Why

The domain `specfly.io` reads as a `fly.io` subdomain and invites confusion with that
unrelated product. `specfly.dev` was purchased 2026-05-25 to cut that association.
Migrating now — while only one adopter is installed and before the GitHub App goes
public (R4) — keeps the blast radius to a single webhook-URL repoint instead of a
fleet-wide migration later.

## What Changes

- The Worker custom-domain route moves from `api.specfly.io` to `api.specfly.dev`
  (`backend/wrangler.toml`). `custom_domain = true` auto-provisions the DNS record + TLS
  cert, which requires the `specfly.dev` zone to exist on the Cloudflare account first.
- The GitHub App webhook URL is repointed from `https://api.specfly.io/webhook` to
  `https://api.specfly.dev/webhook` (App Settings → Webhook URL — manual, maintainer).
- **Cutover safety:** `specfly.io` is kept resolving until the App webhook URL has been
  repointed, so the one installed adopter's push deliveries do not drop mid-migration.
- Docs, tests, and identity references are updated from `specfly.io` to `specfly.dev`
  (`backend/README.md` deploy runbook, `backend/test/signature.test.ts` request URL, and
  the planning briefings that cite `api.specfly.io`).
- No change to Worker behavior. The hostname is deployment configuration; signature
  verification, routing, dispatch, and TTL are all host-agnostic.

## Capabilities

### New Capabilities

<!-- none — this change introduces no new capability -->

### Modified Capabilities

- `webhook-gateway`: ADD a requirement codifying the public ingress contract — the Worker
  is served to GitHub over HTTPS at a stable custom domain (now `api.specfly.dev`,
  `custom_domain = true`), the App's webhook URL targets `https://api.specfly.dev/webhook`,
  and a host migration must keep the prior host resolving until the App URL is repointed so
  no signed delivery is dropped. The existing webhook-gateway spec describes behavior
  (health, signature verification, routing) but never the host; this change records that
  ingress contract. No existing requirement's behavior changes — the host carries no logic.

## Impact

- **Config:** `backend/wrangler.toml` — route `pattern = "api.specfly.io"` →
  `"api.specfly.dev"`, and the adjacent comment naming the required zone.
- **Infra (manual, maintainer):** create/verify the `specfly.dev` Cloudflare zone (DNS +
  TLS for `api.specfly.dev`); repoint the GitHub App webhook URL; keep `specfly.io`
  resolving through the cutover.
- **Tests:** `backend/test/signature.test.ts` — the request URL is cosmetic (HMAC is over
  the body, not the host); updated for consistency.
- **Docs:** `backend/README.md` deploy runbook; planning briefings referencing
  `api.specfly.io` (`briefing-build.md`, `briefing-first-live-apply.md`,
  `HIGH-LEVEL-DESIGN.md`).
- **Specs:** `webhook-gateway` — adds the ingress-host requirement (no behavior change to
  existing requirements).
- **Adopters:** the single installed adopter (`foster-systems/foster-systems`) needs no
  adopter-side change — deliveries are repointed centrally via the App webhook URL.
- **Out of scope / audit trail:** `openspec/changes/archive/**` and
  `openspec/_planning/archive/STATUS.md` are left intact as historical record.
