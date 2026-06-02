## Why

`specfly.dev` has no public face: the README already tells adopters to run
`curl -fsSL https://specfly.dev/install.sh | bash`, but nothing is served at the
apex domain — the install path 404s and there is no landing page to explain what
Specfly is. We need a lean, static public site that highlights the project and,
critically, makes the curl install command actually resolve.

## What Changes

- Add a static landing page served at `specfly.dev`, distilled from `README.md`
  and existing docs — the one-line pitch, the four "Why Specfly" benefits, a short
  "How it works" flow, and links out to the GitHub repo and docs. Lean, not a
  full docs mirror.
- Serve `install.sh` at `https://specfly.dev/install.sh` as `text/x-shellscript`
  (or `text/plain`), byte-identical to the repo's `install.sh` (single source of
  truth — the site build copies it, does not fork it).
- Make the curl install command the visual centerpiece: a copy-paste hero block
  with the `curl … | bash` one-liner.
- Sleek, minimal visual design with an emerald-green accent; no heavy framework,
  no client-side build runtime — plain static HTML/CSS (one page).
- Add a Cloudflare deployment for the apex `specfly.dev` zone, coexisting with the
  existing `api.specfly.dev` Worker, plus a deploy runbook.
- Verify the install script works end-to-end when fetched from the deployed URL.

## Capabilities

### New Capabilities
- `public-landing-page`: the public-facing static site at `specfly.dev` — its
  content requirements, the `install.sh` serving contract, and the Cloudflare
  deployment that hosts both.

### Modified Capabilities
<!-- None. The existing adopter-install-script capability already owns install.sh's
     behavior; this change only adds a new public delivery surface for it. -->

## Impact

- New top-level `site/` directory: static HTML/CSS and its deploy config.
- Cloudflare: new hosting for the apex `specfly.dev` (and `www`) — separate from
  the `specfly` backend Worker on `api.specfly.dev`; the two must not collide.
- `install.sh` gains a second, authoritative delivery URL (`specfly.dev/install.sh`)
  alongside the existing raw GitHub path; content must stay in sync.
- Docs: a short deploy runbook; `docs/README.md` index gains a pointer.
- No backend code, no D1, no API changes.
