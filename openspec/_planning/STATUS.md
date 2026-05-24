# Specfly — status & pickup briefing

_Last updated: 2026-05-24._

Where things stand and where to resume. Full rationale is in [DESIGN.md](DESIGN.md);
this is the short "start here" for the next session.

## Done

- **Named** Specfly (chosen over SpecPilot — taken by an active same-purpose npm
  CLI — and over Specwright/Spectrum). See DESIGN.md §12.
- **Identities reserved:** npm `specfly` (placeholder `0.0.2`), domain
  `specfly.io`, this repo `foster-systems/specfly` (public).
- **Predecessor** `foster-systems/remcc` deprecated, README points here.
- **Scaffold pushed:** reusable `.github/workflows/apply.yml`, the adopter caller
  example, `README.md`, `LICENSE`, `DESIGN.md`.
- **Resolved all DESIGN §11 decisions** (CI-on-PR → keep backend; trigger →
  `@specfly:apply` commit prefix; prereqs → keep OpenSpec + pnpm/bun for now). See
  Decisions below.
- **Wrote build briefings** ([briefing-build.md](briefing-build.md),
  [briefing-wire.md](briefing-wire.md)) and the adopter ruleset guide
  ([docs/protect-main.md](docs/protect-main.md)).
- **Registered the GitHub App `specfly`** — perms PR: write, Contents: read & write,
  Metadata: read; Push + Pull request events. Bot user id **287375800** → commit
  email `287375800+specfly[bot]@users.noreply.github.com`. App ID / private key /
  webhook secret held by the maintainer for deploy.

## Architecture (settled, "B2")

Hosted control plane (GitHub App + tiny Cloudflare Workers backend at
`api.specfly.io`) dispatches into the adopter's own Actions (BYO Anthropic key).
Trigger: a `@specfly:apply` commit pushed to `change/<name>` → backend matches it
on the push webhook → `repository_dispatch` → runner applies + pushes the result →
backend opens the PR as `Specfly[bot]` (and on re-applies pushes an empty commit as
the bot to re-fire CI on the existing PR). Free/open; no
billing, no code/compute/token custody.

## Pick up here (in order)

1. **Build the Cloudflare backend** — full spec in
   [briefing-build.md](briefing-build.md). Run a fresh session: _"build the Specfly
   backend per briefing-build.md"_. Parallel-safe with step 2. Verify against its §17.
2. **Wire `apply.yml`** — full spec in [briefing-wire.md](briefing-wire.md). Run a
   fresh session: _"wire apply.yml per briefing-wire.md"_. Parallel-safe with step 1.
   The bot-identity email is concrete now (`287375800+specfly[bot]@…`). Verify §5.
3. **Deploy the backend** (maintainer; runbook lands in `backend/README.md` from
   step 1): `wrangler d1 create` → migrations → `wrangler secret put` APP_ID /
   PRIVATE_KEY / WEBHOOK_SECRET → `wrangler deploy` → point `api.specfly.io/webhook`
   and the App's webhook URL at it → redeliver a webhook to smoke-test.
4. **Cut and tag `v1`** so `uses: foster-systems/specfly/...@v1` resolves; until
   then adopters reference `@main`.

## Decisions (DESIGN.md §11 — all resolved)

- ~~CI-on-PR requirement~~ — **resolved: keep the backend** (2026-05-24).
- ~~First-run trigger UX~~ — **resolved: `@specfly:apply` commit-prefix trigger**
  (2026-05-24). Backend detects it on the push webhook → repository_dispatch →
  runner applies → backend opens PR on the result push. No draft PR. See §11.2.
- ~~Prerequisite reduction~~ — **resolved: keep OpenSpec + pnpm/bun hard-required
  for now** (2026-05-24); broaden later (npm/yarn first) — additive, no redesign,
  since both live in apply.yml setup and the control plane is agnostic. See §11.3.

## Pointers

- predecessor: https://github.com/foster-systems/remcc (deprecated)
- domain: `specfly.io` (registered)
