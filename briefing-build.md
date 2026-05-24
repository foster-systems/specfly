# Build briefing — Specfly backend (Cloudflare Worker)

> **Audience:** a build agent in a fresh session, working in the
> `foster-systems/specfly` repo. This is the authoritative spec for building the
> Specfly control-plane backend. Read it fully before writing code.
>
> **Prereq reading (in this repo):** `DESIGN.md` §3 (architecture), §4 (components),
> §6 (security model), §7 (usage flow), §11 (resolved decisions); `status.md`.
> This briefing is authoritative where it is more specific than DESIGN.md.
>
> **Status when this is done:** `status.md` step 2 complete (backend built, typechecks,
> tests pass, dry-run deploys). Actual deploy is a gated runbook (needs secrets the
> maintainer holds) — do not attempt to deploy or register anything.

---

## 1. What you are building

A tiny, stateless-ish **webhook router** that is the Specfly control plane. It does
exactly two jobs and nothing else:

1. **Trigger:** when a developer pushes a commit whose subject starts with
   `@specfly:apply` to a `change/<name>` branch in an adopter repo, fire a
   `repository_dispatch` (`event_type: specfly-apply`) into that repo so the
   adopter's own GitHub Actions runner runs `/opsx:apply`.
2. **PR authoring:** when the runner pushes the applied result back to
   `change/<name>`, open a pull request authored by `Specfly[bot]` (the GitHub App
   identity). An App-authored PR is a separate actor (so a solo maintainer can
   approve it) **and** triggers the adopter's CI (a `GITHUB_TOKEN`-authored PR
   would not — that is the entire reason this backend exists).

It also tracks GitHub App `installation` events so it knows which installation id
to authenticate as per repo.

### Non-goals (do NOT build these)
- ❌ No web dashboard, no UI, no OAuth login, no sessions.
- ❌ No billing, no entitlement/quota gating (Specfly is free).
- ❌ No storage of adopter source code or substantive run logs (logs stay in the
  adopter's Actions artifacts). Store only metadata.
- ❌ No hand-rolled crypto. Use the octokit/Web Crypto paths described below.
- ❌ Do not request or use any GitHub permission beyond the three in §10.

---

## 2. Where it lives & how it's reached

- Source: a new top-level directory **`backend/`** in this repo (transparency is a
  project goal — the control plane is public and readable).
- Runtime: a single Cloudflare Worker, public host **`api.specfly.io`**, webhook
  endpoint **`POST /webhook`**.
- State: Cloudflare **D1** (SQLite). Metadata only.
- The GitHub App (`github.com/apps/specfly`) is registered separately by the
  maintainer; its webhook URL points at `https://api.specfly.io/webhook`.

---

## 3. The exact flow (sequence)

```
Developer pushes "@specfly:apply …" commit to change/<name>   (human credentials)
  │
  ├─▶ GitHub delivers `push` webhook → POST /webhook
  │       backend verifies HMAC signature
  │       branch matches change/* AND tip-commit subject starts "@specfly:apply"
  │       AND sender is NOT github-actions[bot]
  │   → mint installation token
  │   → POST /repos/{owner}/{repo}/dispatches { event_type:"specfly-apply", client_payload:{…} }
  │   → INSERT run row (status="dispatched", trigger_sha=<sha>)
  │
  ▼
Adopter workflow (on: repository_dispatch) runs /opsx:apply on the runner,
commits the result, pushes change/<name> using the built-in GITHUB_TOKEN
  │
  ├─▶ GitHub delivers `push` webhook → POST /webhook
  │       sender == github-actions[bot], branch change/*, a "dispatched" run exists
  │   → mint installation token
  │   → if no open PR for head=change/<name>: POST /repos/{owner}/{repo}/pulls
  │       { title, head:"change/<name>", base:<default_branch>, body, draft:false }
  │   → UPDATE run row (status="pr_opened", pr_number=<n>)
  │
  ▼
Specfly[bot] PR exists → adopter CI triggers → human approves → merges
```

Key invariants:
- The runner's result commit subject is `opsx:apply <name>` (no `@specfly:apply`
  prefix) so it can never re-trigger a dispatch.
- A `GITHUB_TOKEN` push cannot trigger Actions (anti-recursion), so the loop is
  safe; webhooks still fire for it, which is how the backend learns the result
  landed.

---

## 4. Tech stack & dependencies

- **Language:** TypeScript (strict).
- **Runtime:** Cloudflare Workers (ES modules `export default { fetch }`).
- **Router:** [`hono`](https://hono.dev) (tiny, Workers-native).
- **GitHub App + API + webhooks:** `@octokit/app` (provides `App` → webhook
  verification via `app.webhooks` and per-installation authenticated clients via
  `app.getInstallationOctokit(id)`). If `@octokit/app` pulls in Node builtins that
  break on the edge, fall back to `@octokit/webhooks-methods` (`verify`) +
  `@octokit/auth-app` + `@octokit/core`; either path is acceptable as long as it
  runs on Workers.
- **Tooling:** `wrangler` (dev/deploy), `typescript`, `vitest` (+ optionally
  `@cloudflare/vitest-pool-workers`) for tests.

> ⚠️ **Edge-compatibility is a known risk with octokit on Workers.** You MUST prove
> the Worker builds and runs (`wrangler deploy --dry-run` and a `wrangler dev`
> smoke test). If you hit `node:*` import errors, add
> `compatibility_flags = ["nodejs_compat"]` to `wrangler.toml` and bump
> `compatibility_date` to a recent date. Pin dependency versions you verified.

---

## 5. Project structure

```
backend/
  package.json
  tsconfig.json
  wrangler.toml
  .dev.vars.example        # documents required secrets; .dev.vars is gitignored
  migrations/
    0001_init.sql
  src/
    index.ts               # Hono app: POST /webhook, GET / (health)
    github.ts              # App init, token mint, dispatch(), openPullRequest()
    handlers/
      push.ts              # push event: trigger-detect + result-detect
      installation.ts      # installation created/deleted → upsert/delete
    logic.ts               # PURE functions (no I/O) — see §11.4, unit-tested
    db.ts                  # D1 query helpers
    types.ts               # Env bindings + shared types
  test/
    logic.test.ts          # unit tests for the pure functions
  README.md                # backend dev + deploy runbook
```

Add `backend/.dev.vars` and `backend/.wrangler/` to the repo `.gitignore`.

---

## 6. Configuration & secrets

`wrangler.toml` (fill `database_id` after creating D1 — see runbook):

```toml
name = "specfly"
main = "src/index.ts"
compatibility_date = "2026-05-01"   # bump as needed; add nodejs_compat if required

[[d1_databases]]
binding = "DB"
database_name = "specfly"
database_id = "<filled-by-runbook>"
```

Secrets (NEVER committed; set via `wrangler secret put`):
- `APP_ID` — the GitHub App's numeric id.
- `PRIVATE_KEY` — the App's PEM private key (multi-line; paste whole file).
- `WEBHOOK_SECRET` — the App webhook signing secret.

`Env` type in `src/types.ts` binds `DB: D1Database` plus the three secrets as
strings. Provide `.dev.vars.example` listing the three keys (no values).

---

## 7. D1 schema (`migrations/0001_init.sql`)

```sql
CREATE TABLE IF NOT EXISTS installations (
  installation_id INTEGER PRIMARY KEY,
  account_login   TEXT NOT NULL,
  account_type    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_full_name  TEXT NOT NULL,      -- "owner/repo"
  installation_id INTEGER NOT NULL,
  branch          TEXT NOT NULL,      -- "change/<name>"
  change_name     TEXT NOT NULL,      -- "<name>"
  trigger_sha     TEXT NOT NULL,      -- the @specfly:apply commit sha (idempotency key)
  status          TEXT NOT NULL,      -- 'dispatched' | 'pr_opened' | 'failed'
  pr_number       INTEGER,
  delivery_id     TEXT,               -- X-GitHub-Delivery of the trigger
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_trigger ON runs(repo_full_name, trigger_sha);
CREATE INDEX IF NOT EXISTS idx_runs_branch ON runs(repo_full_name, branch, status);
```

---

## 8. Endpoints

- `GET /` → `200` plain text, e.g. `specfly backend ok`. No secrets, no DB.
- `POST /webhook` → the GitHub App webhook receiver. Behavior in §9–§11.
  - Always respond quickly with a 2xx once handled (GitHub expects a fast ack).
    Inline handling is fine (the API calls are fast); `ctx.waitUntil` is optional.
  - Return `401` on signature failure; `2xx` with a short body otherwise (even for
    ignored events — a 2xx tells GitHub the delivery succeeded).

---

## 9. Webhook signature verification (do this first, before parsing)

1. Read the **raw** request body as text (do not `JSON.parse` before verifying).
2. Read headers: `x-hub-signature-256`, `x-github-event`, `x-github-delivery`.
3. Verify HMAC-SHA256 against `WEBHOOK_SECRET`. With `@octokit/app`:
   `await app.webhooks.verify(rawBody, signature)` (or `verifyAndReceive`). With
   the fallback: `await verify(secret, rawBody, signature)` from
   `@octokit/webhooks-methods`. Both use Web Crypto and are edge-safe.
4. If verification fails → `401`, do nothing else.
5. Only then `JSON.parse(rawBody)` and route on `x-github-event`.

---

## 10. GitHub App auth (mint a short-lived installation token)

The App is registered with these repository permissions (must match; do not exceed):
- **Pull requests: Read & write**
- **Contents: Read & write** (mandatory — both `…/dispatches` and `…/pulls`
  require Contents: write)
- **Metadata: Read**
- Subscribed events: **Push** (load-bearing), **Pull request** (lifecycle).

Authenticate per request as the installation, using the App id + private key:

```ts
import { App } from "@octokit/app";

const app = new App({
  appId: env.APP_ID,
  privateKey: env.PRIVATE_KEY,
  webhooks: { secret: env.WEBHOOK_SECRET },
});

// after determining installationId from the webhook payload:
const octokit = await app.getInstallationOctokit(installationId);
```

Tokens are minted per request and never stored.

---

## 11. Event handling logic

Route on `x-github-event`. Handle `push` and `installation`; respond 2xx-and-ignore
for anything else.

### 11.1 `installation` event (`src/handlers/installation.ts`)
- `action == "created"` (and `"new_permissions_accepted"`, `"added"`): upsert a
  row into `installations` (`installation_id`, `account.login`, `account.type`).
- `action == "deleted"`: delete the row.
- Respond 2xx.

### 11.2 `push` event — trigger detection
Extract from payload: `repository.full_name`, `repository.default_branch`,
`installation.id`, `ref` (e.g. `refs/heads/change/foo`), `sender.login`,
and the tip commit (`head_commit` — its `id` (sha) and `message`).

Fire a dispatch **iff all** hold:
- `ref` starts with `refs/heads/change/` → derive `branch` and `change_name`.
- `head_commit.message`'s **first line** starts with `@specfly:apply` (trim
  leading whitespace; case-sensitive).
- `sender.login != "github-actions[bot]"` (i.e. a human/normal push, not the runner).
- **Idempotency:** no existing `runs` row with this `(repo_full_name, trigger_sha)`.

Then:
1. Optionally parse `key=value` tokens after the prefix from the first line
   (`model=…`, `effort=…`); ignore unknown keys.
2. Mint installation token (§10).
3. `POST /repos/{owner}/{repo}/dispatches` with:
   ```json
   { "event_type": "specfly-apply",
     "client_payload": { "change": "<name>", "branch": "change/<name>",
       "head_sha": "<trigger_sha>", "model": "<opt>", "effort": "<opt>" } }
   ```
   (`client_payload` ≤ 10 top-level keys — GitHub limit.)
4. `INSERT` a `runs` row: `status="dispatched"`, `trigger_sha`, `delivery_id`.
5. Respond 2xx.

### 11.3 `push` event — result detection (open the PR)
On a `push` that is **not** a trigger, open the PR **iff all** hold:
- `ref` starts with `refs/heads/change/`.
- `sender.login == "github-actions[bot]"` (the runner's `GITHUB_TOKEN` push).
- A `runs` row exists for `(repo_full_name, branch)` with `status="dispatched"`.

Then:
1. Mint installation token.
2. Check for an already-open PR: `GET /repos/{owner}/{repo}/pulls?state=open&head={owner}:change/<name>`.
   If one exists, reuse its number (do not create a duplicate).
3. Otherwise `POST /repos/{owner}/{repo}/pulls`:
   ```json
   { "title": "Apply <name>", "head": "change/<name>",
     "base": "<repository.default_branch>", "draft": false,
     "body": "Applied by Specfly via `/opsx:apply`. Review, approve, merge." }
   ```
4. `UPDATE` the run row: `status="pr_opened"`, `pr_number`, `updated_at`.
5. Respond 2xx.

> If a dispatched run produces **no** result push (apply made no changes, or
> failed), no PR is opened and the run row stays `dispatched`. That is acceptable
> for now (the failure is visible in the adopter's Actions run). Note it in the
> backend README as a known state; a TTL/cleanup job is out of scope.

### 11.4 Pure logic to factor into `src/logic.ts` (unit-tested, no I/O)
- `parseRef(ref): { branch, changeName } | null` — only for `refs/heads/change/*`.
- `isTriggerCommit(firstLine): boolean` — starts with `@specfly:apply`.
- `parseApplyArgs(firstLine): { model?, effort? }`.
- `classifyPush(payload, hasDispatchedRun): "trigger" | "result" | "ignore"`.

Keeping these pure makes the decision rules testable without GitHub or D1.

---

## 12. Contract with the runner (`apply.yml`) — important

`repository_dispatch` triggers the workflow **as defined on the default branch**,
and the run's `github.ref` is the **default branch**, not `change/<name>`. Therefore
the backend MUST pass `change`/`branch` in `client_payload`, and the runner relies
on them to check out the right branch. Wiring `apply.yml` to consume this is
**status.md step 3** (separate task) — but build the `client_payload` exactly as in
§11.2 so that wiring has what it needs. Do not change `apply.yml` in this task
beyond what's needed to document the contract.

---

## 13. Idempotency & edge cases (must handle)
- **Webhook redelivery:** GitHub may resend a delivery. The unique index on
  `(repo_full_name, trigger_sha)` + the "no existing run" check prevent a double
  dispatch. The "already-open PR" check (§11.3.2) prevents a duplicate PR.
- **Multiple commits in one push:** evaluate the **tip** (`head_commit`) only.
- **Re-apply (second `@specfly:apply` on same branch):** new `trigger_sha` → new
  run row → re-dispatch; the result push updates the existing PR (no new PR).
- **Human pushes a non-prefixed commit while a run is dispatched:** sender is human,
  not `github-actions[bot]` → not classified as a result → no premature PR.
- **Unknown event / unmatched push:** respond 2xx and ignore.

---

## 14. Testing (required)
- **Unit (`vitest`):** cover `src/logic.ts` — ref parsing, trigger detection, arg
  parsing, `classifyPush` across the trigger/result/ignore cases. These need no
  network.
- **Signature test:** a test that a tampered body / bad signature is rejected
  (compute a valid `sha256=` HMAC for a fixture, assert accept; flip a byte, assert
  reject).
- **Build/smoke:** `wrangler deploy --dry-run` must succeed; a `wrangler dev` run
  must boot and `GET /` must return ok. Document any `nodejs_compat` flag you needed.

---

## 15. Local dev
- `npm install` in `backend/`.
- Copy `.dev.vars.example` → `.dev.vars`, fill test values (a throwaway webhook
  secret; a test App id/key only if you have one — otherwise unit tests + dry-run
  are sufficient without live secrets).
- `wrangler d1 migrations apply specfly --local` then `wrangler dev`.

---

## 16. Deployment runbook (write into `backend/README.md`; the MAINTAINER runs it)
Do not execute — the maintainer holds the secrets. Document precisely:
1. `wrangler d1 create specfly` → copy `database_id` into `wrangler.toml`.
2. `wrangler d1 migrations apply specfly --remote`.
3. `wrangler secret put APP_ID` / `PRIVATE_KEY` / `WEBHOOK_SECRET`.
4. `wrangler deploy`.
5. Bind the route/custom domain so `https://api.specfly.io/webhook` reaches the
   Worker; set the GitHub App's webhook URL to it.
6. Smoke test: redeliver a recent webhook from the App's Advanced tab; confirm 2xx.

---

## 17. Acceptance criteria (the verifier will check these)
1. `backend/` matches the structure in §5; secrets are referenced only via
   `wrangler secret` / `.dev.vars` (gitignored) — **no secret values committed**.
2. `wrangler.toml` has the D1 binding and a `database_id` placeholder; no secrets
   inlined.
3. Signature verification rejects bad signatures (test present & passing) and runs
   before any payload parsing.
4. `push` handler implements §11.2 (trigger) and §11.3 (result) with the exact
   `client_payload` shape from §11.2 and the §13 idempotency guards.
5. `installation` handler upserts/deletes per §11.1.
6. Pure logic is isolated in `src/logic.ts` and unit-tested; `vitest` passes.
7. `tsc --noEmit` passes; `wrangler deploy --dry-run` succeeds (note any
   `nodejs_compat` requirement).
8. `migrations/0001_init.sql` matches §7 and applies cleanly (`--local`).
9. `backend/README.md` contains the §16 deploy runbook and the known-state note
   from §11.3.
10. No GitHub permission beyond the three in §10 is assumed or used; no dashboard/
    billing/OAuth code exists.
11. `.gitignore` updated for `backend/.dev.vars` and `backend/.wrangler/`.
12. Update `status.md` step 2 to reflect completion when done.

## 18. Guardrails / must-nots (recap)
- No hand-rolled crypto; verification via octokit/Web Crypto only.
- Store metadata only — never adopter source or substantive logs.
- Pure webhook router — no UI, no auth flows, no billing.
- Do not register the App, set secrets, or deploy — that's the maintainer's gated step.
