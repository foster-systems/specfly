## Context

Specfly's apply loop runs on the adopter's own GitHub Actions, but it needs an
external actor to (a) kick off `/opsx:apply` from a marker commit and (b) turn the
runner's output into something a solo maintainer can both approve and have CI run on.
GitHub's anti-recursion rule — pushes/PRs authored by the built-in `GITHUB_TOKEN` do
not trigger Actions and cannot be self-approved — is the whole reason a separate
GitHub App identity (`specfly[bot]`) is required. This change builds that control
plane as a public, readable Cloudflare Worker. See `DESIGN.md` §3/§4/§6/§7/§11 and
`briefing-build.md` for the authoritative detail; this document captures the
load-bearing technical decisions.

## Goals / Non-Goals

**Goals:**
- A single Worker at `api.specfly.io` with `POST /webhook` + `GET /` that verifies
  signatures, classifies pushes, dispatches applies, authors PRs, and tracks installations.
- Decision logic isolated as pure functions so the trigger/result/ignore rules are
  unit-testable without GitHub or D1.
- Provable edge-compatibility: `tsc --noEmit`, `wrangler deploy --dry-run`, and a
  `wrangler dev` smoke test all pass.
- Metadata-only persistence in D1 with redelivery/re-apply idempotency.

**Non-Goals:**
- No dashboard, UI, OAuth/sessions, billing, or quota.
- No storage of adopter source or substantive logs.
- No hand-rolled crypto; no GitHub permission beyond Pull requests R/W, Contents R/W,
  Metadata R.
- No App registration, secret-setting, or deploy (maintainer's gated runbook).
- No change to `apply.yml` beyond documenting the `client_payload` contract (that
  wiring is `status.md` step 3).

## Decisions

**Cloudflare Worker + Hono + D1.** Workers give a stateless edge runtime that matches
a tiny webhook router; Hono is Workers-native and minimal; D1 (SQLite) holds the two
metadata tables. Alternative (a long-running Node service + Postgres) is rejected as
over-provisioned for two endpoints and incompatible with the "public, cheap, simple"
project goal.

**`@octokit/app` as the primary GitHub integration, with a documented fallback.**
`app.webhooks.verify` (Web Crypto, edge-safe) handles signature verification and
`app.getInstallationOctokit(id)` mints per-request installation tokens. If
`@octokit/app` drags in `node:*` builtins that break on the edge, fall back to
`@octokit/webhooks-methods` (`verify`) + `@octokit/auth-app` + `@octokit/core`. Either
path is acceptable provided it runs on Workers. Verified dependency versions are pinned.

**Verify signature on the raw body before parsing.** The handler reads `await
request.text()` and verifies HMAC-SHA256 against `WEBHOOK_SECRET` before any
`JSON.parse`. This is both a security boundary (no untrusted parsing) and a spec
requirement; bad signatures get `401` and nothing else runs.

**Pure decision core in `src/logic.ts`.** `parseRef`, `isTriggerCommit`,
`parseApplyArgs`, and `classifyPush(payload, hasDispatchedRun)` contain all
trigger/result/ignore rules with no I/O. Handlers (`push.ts`, `installation.ts`) do
the D1 lookups and GitHub calls and delegate the decision to these functions. This
keeps the load-bearing rules testable offline and is what the unit tests target.

**Identity-based loop safety.** Classification keys off `sender.login`: a human →
candidate trigger; `github-actions[bot]` → candidate result; `specfly[bot]` (the App's
own CI-refresh commit) → ignore. Combined with the rule that result commits use a
non-`@specfly:apply` subject (`opsx:apply <name>`) and refresh commits use
`chore: re-run CI`, no Specfly-authored or runner-authored push can re-enter as a
trigger. Alternative (tracking state machines per branch to detect loops) is rejected
as more complex and unnecessary given the identity + subject invariants.

**CI refresh via an empty Git Data API commit, not a force-push or PR re-open.** On a
re-run (PR already open), pushing one same-tree commit as the App fast-forwards the
ref and re-fires CI without a duplicate PR and without `Checks: read` (which the App
deliberately does not hold). It is pushed unconditionally — for an adopter with no CI
it is a harmless no-op. Alternatives (closing/reopening the PR, force-pushing) are
rejected as noisier and riskier.

**Idempotency via a unique index, not application locking.** A `UNIQUE
(repo_full_name, trigger_sha)` index plus a pre-dispatch existence check absorbs
webhook redeliveries; the "already-open PR" check absorbs duplicate result pushes.
This needs no coordination/locking on the stateless edge.

**`client_payload` carries `change`/`branch`.** `repository_dispatch` runs `apply.yml`
as defined on the **default** branch with `github.ref` = default branch, so the runner
cannot infer the change branch from the event. The backend therefore passes `change`,
`branch`, `head_sha` (and optional `model`/`effort`) explicitly, within GitHub's
10-key `client_payload` limit.

## Risks / Trade-offs

- **octokit edge-incompatibility (`node:*` imports)** → Prove with `wrangler deploy
  --dry-run` + `wrangler dev`; add `compatibility_flags = ["nodejs_compat"]` and bump
  `compatibility_date` if needed; fall back to the lower-level octokit packages; pin
  verified versions and document any flag in the README.
- **Dispatched run with no result (apply made no changes or failed)** → Accepted
  known-state: run stays `dispatched`, no PR, failure visible in the adopter's Actions
  run. Documented in the README; TTL/cleanup out of scope.
- **Unconditional CI-refresh commit on every re-run** → For adopters with no CI it is
  a harmless empty commit; chosen over reading check state because that would require a
  permission the App must not request.
- **Secret handling** → Secrets only via `wrangler secret`/`.dev.vars` (gitignored);
  `.dev.vars` and `.wrangler/` added to `.gitignore`; no secret values ever committed.
- **Slow webhook handling tripping GitHub's timeout** → API calls are fast and handled
  inline with a prompt `2xx`; `ctx.waitUntil` is available if a step needs deferring.

## Migration Plan

No data migration (greenfield). Deployment is a maintainer-run, gated runbook
(documented in `backend/README.md`, not executed here): `wrangler d1 create specfly`
→ paste `database_id` → `wrangler d1 migrations apply specfly --remote` → `wrangler
secret put APP_ID|PRIVATE_KEY|WEBHOOK_SECRET` → `wrangler deploy` → bind
`api.specfly.io/webhook` and point the App's webhook URL at it → smoke test by
redelivering a recent webhook. Rollback: revert the Worker deploy; the D1 schema is
additive and create-if-not-exists.

## Open Questions

- Which octokit path (`@octokit/app` vs the lower-level fallback) actually builds
  clean on Workers — resolved during implementation by the dry-run/dev smoke test, and
  the chosen path + any `nodejs_compat` flag recorded in the README.
