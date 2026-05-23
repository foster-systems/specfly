# Specfly — status & pickup briefing

_Last updated: 2026-05-23._

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

## Architecture (settled, "B2")
Hosted control plane (GitHub App + tiny Cloudflare Workers backend at
`api.specfly.io`) dispatches into the adopter's own Actions (BYO Anthropic key).
Trigger `specfly:apply` label → backend `repository_dispatch` → runner applies +
pushes `change/<name>` → backend opens the PR as `Specfly[bot]`. Free/open; no
billing, no code/compute/token custody.

## Pick up here (in order)
1. **Settle the one open fork** (DESIGN.md §11.1): must CI run on the generated
   PR? **Yes** → keep the backend (an App-authored PR triggers CI). **No** → the
   backend may be unnecessary (runner opens the PR as `github-actions[bot]`, but
   its PRs don't trigger CI). This gates everything below.
2. **Register the GitHub App `specfly`** — claims `github.com/apps/specfly` (the
   last unclaimed identity). Permissions: Pull requests: write, Contents: read,
   Metadata: read. Subscribe to `pull_request.labeled` + branch `push`. Stash the
   App ID + private key for the backend.
3. **Wire the `apply.yml` TODOs** (both depend on the App existing):
   - author commits as the App's numeric bot identity;
   - the push → backend → PR-open handshake.
4. **Build the Cloudflare backend** (Workers + D1): verify webhook → check label
   → `repository_dispatch` → open/update PR as `Specfly[bot]`.
5. **Document the `main` ruleset** for adopters (UI walkthrough + `gh api`
   snippet). Specfly does NOT auto-configure it (no admin permission requested).
6. **Cut and tag `v1`** so `uses: foster-systems/specfly/...@v1` resolves; until
   then adopters reference `@main`.

## Open questions (DESIGN.md §11)
CI-on-PR requirement (above); first-run trigger UX (auto-draft-PR vs dashboard
button); prerequisite reduction (keep OpenSpec + pnpm/bun as hard requirements?).

## Pointers
- npm: https://www.npmjs.com/package/specfly (maintainer `premeq`)
- domain: `specfly.io` (registered)
- predecessor: https://github.com/foster-systems/remcc (deprecated)
