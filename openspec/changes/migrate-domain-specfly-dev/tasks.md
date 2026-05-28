## 1. Repository: flip the host references

- [x] 1.1 In `backend/wrangler.toml`, change the route `pattern = "api.specfly.io"` to
      `pattern = "api.specfly.dev"`, and update the adjacent comment that names the required
      zone (`specfly.io` zone → `specfly.dev` zone).
- [x] 1.2 In `backend/README.md`, update the deploy runbook (step 5, ~line 237) so the
      route/custom-domain and GitHub App webhook URL read `https://api.specfly.dev/webhook`.
- [x] 1.3 In `backend/test/signature.test.ts`, change the request URL
      `https://api.specfly.io/webhook` → `https://api.specfly.dev/webhook` (cosmetic — the
      HMAC is over the body, not the host; assertions are unchanged).
- [x] 1.4 Update the active planning docs that cite the old host:
      `openspec/_planning/HIGH-LEVEL-DESIGN.md` (backend host, the fixed-cost domain line,
      and the identity line), `openspec/_planning/briefing-build.md`, and
      `openspec/_planning/briefing-first-live-apply.md` — `api.specfly.io` →
      `api.specfly.dev` and `specfly.io` → `specfly.dev`. Leave
      `openspec/changes/archive/**` and `openspec/_planning/archive/STATUS.md` untouched
      (audit trail).

## 2. Repository: verify

- [x] 2.1 From `backend/`, run `npx tsc --noEmit` (or the project's typecheck) — clean.
- [x] 2.2 From `backend/`, run the vitest suite — all green (no test logic changed).
- [x] 2.3 Run `git grep -i 'specfly\.io'` from the repo root — confirm the only remaining
      hits are under `openspec/changes/archive/**` and `openspec/_planning/archive/`
      (intentional audit trail) plus the roadmap line for R1 itself.

## 3. Infrastructure cutover (maintainer — not agent-applicable)

> Additive-first ordering protects the one installed adopter; keep `specfly.io` resolving
> until step 3.4 repoints the App. See `design.md` for rationale.

- [x] 3.1 Add the `specfly.dev` zone to the Cloudflare account (DNS hosted there) so
      `custom_domain = true` can auto-provision the `api.specfly.dev` record + TLS cert.
- [x] 3.2 From `backend/`, run `wrangler deploy` with the updated route. The old
      `specfly.io` host still resolves and the App still points at the old URL, so no
      delivery has moved yet.
- [x] 3.3 Verify `https://api.specfly.dev/webhook` is reachable: valid TLS and `GET /` →
      `200` health check.
- [x] 3.4 Repoint the GitHub App webhook URL (Settings → specfly → Webhook URL) to
      `https://api.specfly.dev/webhook`. This is the atomic cutover.
- [x] 3.5 Smoke-test from the App's *Advanced* tab: redeliver a recent webhook → expect
      `2xx`; send a corrupted-signature delivery → expect `401`.
- [x] 3.6 Leave `specfly.io` resolving as a safety net (rollback = repoint the App URL back
      to `https://api.specfly.io/webhook`). Decommissioning `specfly.io` is a later,
      separate cleanup.
