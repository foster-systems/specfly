## Context

`specfly.dev` is a Cloudflare zone. Today only one sub-host is wired: the
`specfly` backend Worker owns `api.specfly.dev` (custom domain, see
`backend/wrangler.toml`). The apex `specfly.dev` serves nothing, yet `README.md`
and `install.sh`'s own header both advertise
`curl -fsSL https://specfly.dev/install.sh | bash`. So the headline onboarding
path is currently broken, and there is no public page describing the project.

This change adds a lean static site at the apex. Constraints:
- Deploy tooling is already `wrangler` (the team has the Cloudflare account and
  the `specfly.dev` zone). Reuse it; don't introduce a second paradigm.
- `install.sh` must stay single-source — the repo root copy is authoritative;
  the site must not fork it.
- It must coexist with the `api.specfly.dev` Worker without collision.
- "Lean": one HTML page, no JS framework, no client build runtime.

## Goals / Non-Goals

**Goals:**
- A single static page at `specfly.dev` distilled from `README.md`: pitch, the
  four "Why Specfly" benefits, the short "How it works" flow, links to repo/docs.
- The curl install one-liner as the page's visual centerpiece, copy-pasteable.
- `https://specfly.dev/install.sh` returns the repo's `install.sh` bytes
  unaltered, so `curl … | bash` runs exactly the committed script.
- Emerald-green accent, sleek/minimal aesthetic.
- A repeatable `wrangler` deploy + a short runbook.

**Non-Goals:**
- No docs mirror — docs stay on GitHub; the page links out.
- No CMS, analytics, blog, or multi-page nav.
- No changes to `install.sh`'s behavior or to the backend Worker.
- No `www`/SEO/meta polish beyond a title + description (can follow later).

## Decisions

### D1 — Cloudflare Workers Static Assets (not Pages)
Host the site as a tiny Worker using the `assets` directive (a new
`site/wrangler.toml` with `[assets] directory = "./public"`), bound to the apex
`specfly.dev` via a `custom_domain` route — mirroring how `backend` binds
`api.specfly.dev`.

- *Why over Cloudflare Pages:* the repo already deploys with `wrangler` and the
  team holds the zone; one CLI, one mental model, one `wrangler deploy`. Pages
  would add a separate dashboard-linked project and a second deploy paradigm for
  what is one HTML file plus one script.
- *Why a separate Worker, not a route on the backend Worker:* keeps the public
  static surface fully isolated from the webhook/secret-handling control plane
  (no shared code, no shared blast radius), and lets each deploy independently.
- Static Assets serve file bytes verbatim with no transformation, so piping
  `/install.sh` to `bash` runs the exact committed bytes. (For `curl | bash` the
  Content-Type is irrelevant; correctness comes from byte-fidelity.)

### D2 — `install.sh` single source via a copy step
The authoritative `install.sh` stays at repo root. The site's `public/` is the
asset root; a predeploy step (`cp ../install.sh public/install.sh`, wired as an
npm `predeploy`/`build` script) places it there. The copied `public/install.sh`
is git-ignored so the root copy can never drift from a stale committed duplicate.

- *Alternative considered — symlink:* rejected; wrangler asset upload across a
  symlink is brittle and platform-dependent.
- *Alternative considered — serve install.sh from the backend Worker at
  `api.specfly.dev/install.sh` and redirect:* rejected; the README contract is
  the apex URL, and a redirect complicates `curl -fsSL` semantics.

### D3 — Plain HTML + a single CSS file
One `index.html` with an inline or adjacent `styles.css`; system font stack;
emerald accent (`#10b981`-family) on a near-neutral background. No build tool.

- *Why:* "lean" is an explicit requirement; a framework would add a build runtime
  for zero benefit on a one-page site.

### D4 — Content sourced from existing docs, not rewritten
Hero pitch and the four benefits come verbatim-in-spirit from `README.md` so the
public message stays consistent with the repo. The page links to
`github.com/foster-systems/specfly` and the docs index rather than restating them.

## Risks / Trade-offs

- **Apex routing collision with the existing zone config** → the backend uses
  `api.specfly.dev`; the site uses the apex `specfly.dev`. Distinct hostnames,
  no overlap. Verify in the Cloudflare dashboard that no pre-existing apex
  record (e.g. a parked redirect) shadows the Worker route before deploy.
- **`install.sh` drift between root and served copy** → mitigated by D2: the
  served file is a build-time copy of the root file, git-ignored, regenerated on
  every deploy; never hand-edited.
- **`curl | bash` returns HTML instead of the script** (misconfigured route, 404
  fallback to index) → mitigated by an explicit post-deploy verification that
  `curl -fsSL https://specfly.dev/install.sh | head` shows the shebang, and a
  full dry-run of the installer against a smoke-test repo.
- **Worker static-asset 404 handling serving index.html for unknown paths** →
  configure `not_found_handling` so `/install.sh` resolves to the file, not the
  SPA fallback.

## Migration Plan

1. Add `site/` (`public/index.html`, `public/styles.css`, `wrangler.toml`,
   `package.json` with a `predeploy` copy step) and a deploy runbook.
2. `cd site && npm run deploy` (wrangler) — provisions the apex custom domain +
   TLS on first deploy.
3. Post-deploy verify: page loads at `https://specfly.dev`;
   `curl -fsSL https://specfly.dev/install.sh | head` shows the shebang;
   run the installer end-to-end against the smoke-test adopter repo.
4. Rollback: `wrangler rollback` (or delete the apex route); the backend Worker
   and `install.sh`'s GitHub raw path are unaffected, so onboarding still has the
   manual fallback.

## Open Questions

- Should `www.specfly.dev` redirect to the apex? Deferred — out of scope for the
  lean first cut, can be added as a zone redirect rule later.
