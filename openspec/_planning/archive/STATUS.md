# Specfly — status & pickup (ARCHIVED 2026-05-27)

_Superseded by `openspec/_planning/.roadmap.md`. Kept for the "Done" history below._

_Last updated: 2026-05-26._

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
  secret held by the maintainer for deploy. Owned by the `foster-systems` org
  (App ID `3836245`, slug `specfly`). **Visibility: private** ("Only on this account")
  — to be **made public later** ("Any account") so the `https://github.com/apps/specfly`
  install page resolves for outside adopters. _(Settings → Apps → specfly → "Where can
  this GitHub App be installed?")_
- **First live end-to-end apply — PASSED** (2026-05-25) 🎉 — the dispatch → App-authored
  PR path that the deploy smoke test couldn't reach is now validated in production
  (incl. `APP_ID`/`PRIVATE_KEY` token-minting). Adopter: `foster-systems/foster-systems`
  (the Astro foster.systems site, `pnpm@10.33.4`, OpenSpec + `.claude/` OPSX commands)
  converted from the deprecated `remcc` path → first **specfly** adopter (App installed,
  `ANTHROPIC_API_KEY` set, `main` protected, caller `specfly.yml` merged via PR #16). A
  human `@spec:apply add-humans-txt` push exercised all 7 pass criteria: webhook `202` →
  token mint → `repository_dispatch` → "Specfly Apply" run (checkout resolved the change
  branch, not `main`) → `/opsx:apply` wrote `public/humans.txt` → result push `opsx:apply
  add-humans-txt` → **App-authored PR #17 "Apply add-humans-txt"** by `app/specfly`
  (since **merged** → `public/humans.txt` now on the adopter's `main`) →
  adopter **CI fired on the PR** (Cloudflare Pages + build, proving the distinct-actor PR
  re-triggers checks) → **D1 `dispatched` → `pr_opened`** → **no dispatch loop** (result
  push & PR-open classified result/ignore; dormant remcc `opsx-apply.yml` skipped each
  time). Took **3 triggers**: two surfaced real prod blockers, both fixed —
  (1) `PRIVATE_KEY` was PKCS#1 not PKCS#8 → re-stored as PKCS#8 (+ `createApp` fail-fast
  guard, see below); (2) the repo's `ANTHROPIC_API_KEY` was a stale remcc-era key →
  maintainer set a valid one.
- **Second live adopter apply — PASSED** (2026-05-26) — `foster-systems/foster-systems`
  change `fix-github-org-link` applied end-to-end → **App-authored PR #18 "Apply
  fix-github-org-link"** by `app/specfly` (runner result commit `opsx:apply fix-github-org-link`
  by `specfly[bot]`; D1 `dispatched` → `pr_opened`, no loop). Diagnosis chain worth remembering:
  the initial "didn't trigger" was **not** the commit or backend — the backend verified, classified,
  dispatched, and recorded the `dispatched` D1 row correctly (webhook returned `202`). The sole
  cause was a **GitHub Actions auth incident** (2026-05-26, started 10:57 UTC: runs not starting,
  action downloads blocked, git-fetch 403s — see githubstatus.com). Re-ran clean once GitHub
  recovered. Gotcha: a `dispatched` D1 row dedups its exact sha, so a webhook *redelivery* won't
  re-fire — retrigger with a **new** `@spec:apply` sha (or delete the row; TTL-swept in 7 days).
- **Apply runner hardened — no third-party action downloads** (2026-05-26, on `main` + `v1`)
  _(hotfix; no spec delta — the package-manager mechanism isn't specified in `apply-runner/`)_ —
  GitHub fetches EVERY referenced action at "Set up job" regardless of `if:`, so a flaky `codeload`
  download of `pnpm/action-setup` **or** `oven-sh/setup-bun` stalls setup for ALL adopters (even
  pnpm-only repos — the bun action is fetched too). `apply.yml` now provisions pnpm via **Corepack**
  (`corepack@latest && corepack enable`, reads `packageManager`) and bun via its official
  `bun.sh/install` script; only first-party `actions/*` remain. `actionlint` clean.
- **PKCS#8 private-key guard + docs** (2026-05-25, **merged — PR #4**) — `createApp`
  (`backend/src/github.ts`) fail-fasts on a PKCS#1 `PRIVATE_KEY` with the exact
  `openssl pkcs8 -topk8` remedy (instead of the cryptic `universal-github-app-jwt` error
  that only surfaces at the first real trigger); `backend/README.md` deploy runbook
  documents the PKCS#8 requirement + conversion; `backend/test/github.test.ts` covers it.
  `tsc` clean, **40** vitest green. _Backend redeploy still pending and optional_ (prod
  already holds a PKCS#8 key, so the deployed guard is only a safety net for future
  (re)deploys; the merged code isn't live until `wrangler deploy`).
- **Backend deployed to production** (2026-05-25, runbook in `backend/README.md`) —
  Worker live at `https://api.specfly.io/webhook` (D1 `specfly` =
  `a86cfe75-4321-4585-a3d0-49be85a41127`, migration `0001` applied `--remote`; all four
  secrets set; daily TTL cron `0 3 * * *` shipped). `workers.dev` auto-disabled by the
  custom-domain route, so the Worker is reachable only at `api.specfly.io`. Smoke-tested:
  `401` on a bad signature, `202` on a real GitHub-signed redelivery. The live dispatch →
  App-authored PR path is now **exercised end-to-end** (see "First live end-to-end apply"
  above).
- **`v1` tag** — `v1` → `87689c6` (moved 2026-05-26 for the no-third-party-action hardening
  above; earlier `f091035` after the keyword rename below, `4547b1f` at first cut), so
  `uses: …/apply.yml@v1` carries the `cancel-in-progress` concurrency guard, the `@spec:apply`
  error text, and the Corepack/bun-script setup. Future releases move it:
  `git tag -f v1 <sha> && git push -f origin v1` — the **maintainer** runs the force-push
  (agent is blocked by a `git push -f:*` deny rule).
- **Trigger keyword renamed** `@specfly:apply` → `@spec:apply` (2026-05-25, PR #3) —
  shorter, reads better. Sole functional change is the backend `MARKER`
  (`backend/src/logic.ts`, matched via `startsWith`, case-sensitive); **redeployed**
  (Version `3b375d3a`) and health-checked (`200` / `401`). Everything else was
  docs/tests/comments + the one `apply.yml` non-fast-forward `::error` string. Left intact:
  `openspec/changes/archive/**` (audit trail) and the hyphenated dispatch
  `event_type: specfly-apply` (a different string). `tsc` clean, **38** vitest green.
- Naming, identities (npm/domain/repo), predecessor `remcc` deprecated, scaffold +
  briefings + ruleset guide.

## Pick up here (in order)

1. **Migrate domain `specfly.io` → `specfly.dev`** — `specfly.dev` purchased 2026-05-25.
   _Why:_ cut away from any `fly.io` association/confusion. Touches: the Worker custom-domain
   route (`backend/wrangler.toml` `pattern = "api.specfly.io"`; live at `api.specfly.io/webhook`
   → `api.specfly.dev/webhook`, plus Cloudflare DNS + TLS for the new zone), the **GitHub App
   webhook URL** (Settings → specfly → Webhook URL), and the npm/domain/repo identity + docs
   references to `specfly.io`. Cutover gotcha: keep `specfly.io` resolving during the transition
   so the one installed adopter's webhooks don't drop until the App URL is repointed. The landing
   page (below) should target `specfly.dev`.

2. **Branding and promotion** — add a logo, revise README.md, create a simple `specfly.dev`
   landing page. (The adopter `foster-systems/foster-systems` is itself an Astro site — a
   natural reference for the landing page.)

   _Optional / when-ready follow-ups from the live-apply test (none blocking; the path
   PASSED and both PRs are merged):_
   - **(optional) `cd backend && wrangler deploy`** to ship the PKCS#8 guard from PR #4.
     Safety net only — prod already holds a PKCS#8 key, so the merged code isn't live until
     this runs, but nothing breaks without it.
   - **Make the App public** ("Any account") when ready for outside adopters — see App
     bullet in Done.
   - **Stale merged branches, safe to delete:** `harden-private-key-pkcs8` (specfly, PR #4),
     `setup/specfly-caller` (adopter, PR #16). `change/add-humans-txt` was auto-deleted on
     the PR #17 merge. (The `pr_opened` D1 rows self-reclaim via the daily TTL cron.)
   - **PR #18** (adopter `fix-github-org-link`) is **open** — review/merge to land the
     GitHub-org-link fix. Its `change/fix-github-org-link` branch carries a couple of empty
     `@spec:apply` re-trigger commits from the incident-recovery testing (harmless; squash on
     merge). Local specfly branches `harden-apply-pnpm-corepack` + `harden-apply-bun-script`
     are merged into `main` (never pushed) and can be deleted.

## Pointers

- briefings: [briefing-build.md](briefing-build.md), [briefing-wire.md](briefing-wire.md),
  [briefing-apply-concurrency.md](briefing-apply-concurrency.md),
  [briefing-first-live-apply.md](briefing-first-live-apply.md); ruleset:
  `docs/protect-main.md`
- App bot: `287375800+specfly[bot]@users.noreply.github.com`
- predecessor (deprecated): `foster-systems/remcc`; domain `specfly.io`
