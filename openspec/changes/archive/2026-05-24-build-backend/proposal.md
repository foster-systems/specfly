## Why

Specfly's `/opsx:apply` loop needs a control plane that turns an adopter's
`@specfly:apply` commit into a runner dispatch, and then turns the runner's result
into a PR authored by the GitHub App. The App identity is load-bearing: only an
App-authored PR (or App push) is a distinct actor that a solo maintainer can approve
**and** that re-fires the adopter's CI — a `GITHUB_TOKEN`-authored PR/push cannot.
Without this backend, the apply loop cannot close. Nothing exists yet; this builds it.

## What Changes

- Add a new top-level **`backend/`** directory: a single stateless-ish Cloudflare
  Worker (TypeScript strict, Hono router, octokit GitHub App) reached at
  `POST /webhook` with a `GET /` health endpoint.
- Verify every webhook's HMAC-SHA256 signature on the **raw** body before any
  parsing; reject bad signatures with `401`, ack everything else with a fast `2xx`.
- On a human push to `change/<name>` whose tip-commit subject starts
  `@specfly:apply`, fire a `repository_dispatch` (`event_type: specfly-apply`) so the
  adopter's own runner executes `/opsx:apply`; record a `dispatched` run.
- On the runner's `github-actions[bot]` push back to `change/<name>`, open an
  App-authored PR (first apply) or push one empty CI-refresh commit as the App
  (re-run, PR already open) so the adopter's CI fires.
- Track GitHub App `installation` events (upsert on created/added/perms-accepted,
  delete on deleted) so the backend knows which installation id to auth as.
- Persist metadata only in Cloudflare **D1** (SQLite): `installations` + `runs`,
  with a unique `(repo_full_name, trigger_sha)` index for redelivery idempotency.
- Add tests (vitest unit tests for the pure decision logic + a signature
  accept/reject test) and a maintainer deploy runbook in `backend/README.md`.
- Update `.gitignore` (`backend/.dev.vars`, `backend/.wrangler/`) and mark
  `status.md` step 2 complete.

Non-goals (explicitly NOT built): web dashboard, UI, OAuth/sessions, billing/quota,
storage of adopter source or substantive logs, hand-rolled crypto, any GitHub
permission beyond Pull requests R/W + Contents R/W + Metadata R. The App is **not**
registered, no secrets are set, and nothing is deployed — that is the maintainer's
gated runbook step.

## Capabilities

### New Capabilities
- `webhook-gateway`: The `POST /webhook` receiver and `GET /` health endpoint —
  raw-body HMAC-SHA256 signature verification before parsing, `401` on failure, fast
  `2xx` ack, and routing on `x-github-event` (handle `push`/`installation`, ignore
  the rest). Includes per-request GitHub App installation-token minting (never stored).
- `apply-dispatch`: Classifying an inbound `push` and, when it is a trigger
  (`change/*` branch, tip subject starts `@specfly:apply`, sender ≠
  `github-actions[bot]`, no existing run for the sha), firing the `specfly-apply`
  `repository_dispatch` with the exact `client_payload` shape and recording a
  `dispatched` run — with redelivery/re-apply idempotency.
- `pr-authoring`: Handling the runner's result `push` — opening an App-authored PR
  on first apply, or pushing one empty CI-refresh commit as the App (via the Git Data
  API) on a re-run when a PR is already open — and updating the run row.
- `installation-tracking`: Upserting/deleting `installations` rows from GitHub App
  `installation` lifecycle events.

### Modified Capabilities
<!-- None — no existing specs under openspec/specs/; this is greenfield. -->

## Impact

- **New code:** `backend/` (`src/index.ts`, `src/github.ts`, `src/handlers/{push,installation}.ts`,
  `src/logic.ts`, `src/db.ts`, `src/types.ts`, `test/logic.test.ts`,
  `migrations/0001_init.sql`, `package.json`, `tsconfig.json`, `wrangler.toml`,
  `.dev.vars.example`, `README.md`).
- **Dependencies:** `hono`, `@octokit/app` (fallback: `@octokit/webhooks-methods` +
  `@octokit/auth-app` + `@octokit/core`), dev: `wrangler`, `typescript`, `vitest`
  (optionally `@cloudflare/vitest-pool-workers`). Edge-compat risk: may need
  `nodejs_compat` + a bumped `compatibility_date`.
- **Infra:** Cloudflare Worker at `api.specfly.io` + a D1 database `specfly`
  (created/bound by the maintainer runbook). Secrets `APP_ID`, `PRIVATE_KEY`,
  `WEBHOOK_SECRET` via `wrangler secret` only.
- **Repo:** `.gitignore` and `status.md` updates.
- **Contract (out of scope to change here):** the `client_payload` must carry
  `change`/`branch` because `repository_dispatch` runs `apply.yml` from the default
  branch; wiring `apply.yml` to consume it is `status.md` step 3, a separate task.
