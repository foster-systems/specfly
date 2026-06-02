## 1. Scaffold the site project

- [x] 1.1 Create `site/` with `public/` as the asset root, plus `package.json`
      and `wrangler.toml`.
- [x] 1.2 In `package.json`, add a `predeploy` (or `build`) script that copies the
      repo-root `install.sh` to `site/public/install.sh`, and a `deploy` script
      (`wrangler deploy`).
- [x] 1.3 Git-ignore `site/public/install.sh` so the served copy never drifts from
      the authoritative root `install.sh`.
- [x] 1.4 Configure `site/wrangler.toml`: a static `[assets]` directory pointing at
      `./public`, a `custom_domain` route on the apex `specfly.dev`, and
      `not_found_handling` so unknown paths do NOT serve `index.html` over real
      files like `/install.sh`.

## 2. Build the landing page

- [x] 2.1 Write `public/index.html`: hero pitch, the four "Why Specfly" benefits,
      a short "How it works" flow, and links to the GitHub repo and docs index —
      sourced from `README.md`, kept lean (one page, no JS framework).
- [x] 2.2 Make the `curl -fsSL https://specfly.dev/install.sh | bash` one-liner the
      visual centerpiece as a copy-pasteable block; ensure it is byte-identical to
      the command in `README.md`.
- [x] 2.3 Add `public/styles.css` (or inline styles): sleek/minimal layout, emerald
      accent, system font stack, no client build runtime.
- [x] 2.4 Add a `<title>` and meta description; confirm no JavaScript framework or
      build step is required.

## 3. Deploy and verify

- [x] 3.1 Run the predeploy copy + `wrangler deploy` for the `site/` project to the
      apex `specfly.dev` (provisions custom domain + TLS on first deploy).
- [x] 3.2 Verify `https://specfly.dev/` returns the page (HTTP 200) and that
      `api.specfly.dev` still reaches the backend Worker (no route collision).
- [x] 3.3 Verify `curl -fsSL https://specfly.dev/install.sh | head` shows the
      `#!/usr/bin/env bash` shebang and that the served bytes match the root
      `install.sh` (e.g. compare with `diff`/`shasum`), not HTML.
- [ ] 3.4 Run the installer end-to-end via the curl pipe against the smoke-test
      adopter repo (`foster-systems/foster-systems`) and confirm it completes.

## 4. Documentation

- [x] 4.1 Add a short deploy runbook for the site (deploy, verify, rollback) and
      add a pointer to it from `docs/README.md`.
