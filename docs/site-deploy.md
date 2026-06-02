# Site deploy runbook

The public landing page at [`specfly.dev`](https://specfly.dev) is a Cloudflare
Workers Static-Assets project under [`site/`](../site). It is fully independent of
the backend Worker (`api.specfly.dev`): separate `wrangler.toml`, separate deploy
and rollback, no shared route or code.

## What gets served

- `/` → `site/public/index.html` (landing page) + `site/public/styles.css`.
- `/install.sh` → a build-time copy of the repo-root [`install.sh`](../install.sh).
  The copy is git-ignored and regenerated on every deploy by the `predeploy`
  script, so the served bytes can never drift from the authoritative root file.
  `not_found_handling = "none"` keeps unknown paths from falling back to the
  landing page, so `/install.sh` is always served as the raw script.

## Deploy

```bash
cd site
npm install        # first time only — installs wrangler
npm run deploy     # runs predeploy (copies install.sh) then `wrangler deploy`
```

The first deploy provisions the apex `specfly.dev` custom domain (DNS record +
TLS cert) from the `[[routes]]` entry in `site/wrangler.toml`. Requires the
`specfly.dev` zone on the configured Cloudflare account (`wrangler login` first
if not authenticated).

## Verify

```bash
# 1. Landing page returns 200 HTML.
curl -fsS -o /dev/null -w '%{http_code}\n' https://specfly.dev/

# 2. install.sh is the raw script (shebang on line 1), not HTML.
curl -fsSL https://specfly.dev/install.sh | head -1     # -> #!/usr/bin/env bash

# 3. Served bytes match the repo-root install.sh exactly.
diff <(curl -fsSL https://specfly.dev/install.sh) install.sh && echo "in sync"

# 4. Backend is untouched — api.specfly.dev still reaches the Worker.
curl -fsS -o /dev/null -w '%{http_code}\n' https://api.specfly.dev/
```

Then run the installer end-to-end against the smoke-test adopter repo
(`foster-systems/foster-systems`):

```bash
curl -fsSL https://specfly.dev/install.sh | bash
```

## Rollback

```bash
cd site
wrangler rollback           # revert to the previous deployment
```

The backend Worker, its D1 database, and the webhook route are unaffected. If the
apex route itself needs to be removed, delete the `specfly-site` Worker from the
Cloudflare dashboard — onboarding still has the manual fallback documented in the
README.
