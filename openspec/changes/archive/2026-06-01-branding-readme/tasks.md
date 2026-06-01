## 1. Inventory and plan the doc hierarchy

- [x] 1.1 List the current doc set and the topics each covers (`README.md`, `backend/README.md`, `docs/protect-main.md`, `openspec/_planning/HIGH-LEVEL-DESIGN.md`); note overlaps and the single authoritative home for each topic.
- [x] 1.2 Decide the public design surface: create `docs/design.md` as a thin overview that links to `openspec/_planning/HIGH-LEVEL-DESIGN.md` (keeps the planning dir internal).

## 2. Rewrite the README as a benefit-led landing page

- [x] 2.1 Open with title, one-line value proposition, and the early-development status note.
- [x] 2.2 Add a "Why Specfly" / benefits block leading with the three key benefits: safe unattended runs in ephemeral isolated environments; cost control (bring-your-own-key, no token reselling, near-zero maintainer cost); composability into bigger workflows — placed before any setup steps.
- [x] 2.3 Keep a trimmed "How it works" section with the control-plane/data-plane diagram.
- [x] 2.4 Condense "Get started" to the minimal adopter path (install App, add `ANTHROPIC_API_KEY`, add caller workflow, copy command file, protect `main`), linking out for full detail.
- [x] 2.5 Move the "Fine-tuning for your stack" table out of the README into `docs/fine-tuning.md` and link to it from "Get started".

## 3. Build the docs index and consolidate

- [x] 3.1 Add a documentation index (a "Documentation" section in the README and/or `docs/README.md`) linking each doc with a one-line description: design overview, fine-tuning, protecting main, backend reference.
- [x] 3.2 Trim `backend/README.md` to engineering specifics (endpoints, layout, runbook); replace restated design/security rationale with a link to `docs/design.md` / HIGH-LEVEL-DESIGN.md.
- [x] 3.3 Ensure each topic has exactly one authoritative source; remove duplicated narrative.

## 4. Fix links and references

- [x] 4.1 Replace both broken `[DESIGN.md](DESIGN.md)` links in the README with the working `docs/design.md` link.
- [x] 4.2 Grep all relative markdown links across `README.md`, `backend/README.md`, `docs/**` and confirm each target exists.
- [x] 4.3 Grep for stale domain references (e.g. `specfly.io`) and confirm only `specfly.dev` remains.

## 5. Verify against the spec

- [x] 5.1 Confirm the README shows the three benefits above the setup steps and defers long-form detail to linked docs.
- [x] 5.2 Confirm no documentation link 404s and the index lists every doc.
- [x] 5.3 Run `openspec validate --changes branding-readme` and confirm it passes.
