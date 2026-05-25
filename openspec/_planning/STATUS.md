# Specfly — status & pickup

_Last updated: 2026-05-25._

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
- **Apply runner wired** (`apply.yml`) _(change `wire-apply-runner`)_ — dispatched
  runs now check out `change/<name>` (the old `ref: github.ref` grabbed the default
  branch on `repository_dispatch`); applied commits are authored as the bot identity
  (`287375800+specfly[bot]@…`, cosmetic only — the result-push `sender` stays
  `github-actions[bot]`); the implicit push → PR-open handshake is documented (no
  runner → backend callback). Manual e2e plan recorded in the workflow header;
  `actionlint` clean.
- **Apply runner hardened** (`apply.yml`) _(change `harden-apply-runner` — archived)_ —
  checkout now prefers the dispatched `head_sha` (detached, deterministic under
  concurrent pushes; branch-tip fallback keeps older callers working), the result push
  is fail-closed on divergence (no `--force`), and apply/validate outcomes report to the
  job summary + `::warning` annotations (report-only — branch still pushes, run stays
  green). Caller passes `head_sha` from `client_payload`; `actionlint` clean. Delta
  synced into `openspec/specs/apply-runner/`.
- **GitHub App `specfly` registered** — bot id **287375800**
  (`287375800+specfly[bot]@users.noreply.github.com`); App ID / private key / webhook
  secret held by the maintainer for deploy.
- **Backend deployed to production** (2026-05-25, runbook in `backend/README.md`) —
  Worker live at `https://api.specfly.io/webhook` (D1 `specfly` =
  `a86cfe75-4321-4585-a3d0-49be85a41127`, migration `0001` applied `--remote`; all four
  secrets set; daily TTL cron `0 3 * * *` shipped). `workers.dev` auto-disabled by the
  custom-domain route, so the Worker is reachable only at `api.specfly.io`. Smoke-tested:
  `401` on a bad signature, `202` on a real GitHub-signed redelivery. **Not yet
  exercised:** the live dispatch → App-authored PR path (fires on the first real
  `@specfly:apply` push in an installed repo).
- Naming, identities (npm/domain/repo), predecessor `remcc` deprecated, scaffold +
  briefings + ruleset guide.

## Pick up here (in order)

1. **Cut & tag `v1`** so `uses: …/apply.yml@v1` resolves (adopters reference `@v1`,
   not a sha). The concurrency guard reaches adopters only once `v1` includes it —
   move/re-tag `v1` after the supersede change.
2. **First live end-to-end apply** — push a real `@specfly:apply` commit in an installed
   repo to exercise the dispatch → App-authored PR path that the deploy smoke test can't
   reach (this is what validates `APP_ID` / `PRIVATE_KEY` token-minting in production).

## Pointers

- briefings: [briefing-build.md](briefing-build.md), [briefing-wire.md](briefing-wire.md),
  [briefing-apply-concurrency.md](briefing-apply-concurrency.md); ruleset:
  `docs/protect-main.md`
- App bot: `287375800+specfly[bot]@users.noreply.github.com`
- predecessor (deprecated): `foster-systems/remcc`; domain `specfly.io`
