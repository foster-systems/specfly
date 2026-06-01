## Why

The README is the project's front door and the source content for the future
`specfly.dev` landing page (R12), but today it buries the three benefits that
actually sell Specfly — safe unattended runs in ephemeral isolated environments,
cost control, and composability into larger workflows — under setup mechanics. It
also links twice to a `DESIGN.md` that does not exist (the real design lives at
`openspec/_planning/HIGH-LEVEL-DESIGN.md`), and project documentation is spread
across overlapping files with no clear hierarchy. R2 is the branding + promotion
pass that fixes this before R12 reuses the content.

## What Changes

- Rewrite `README.md` as a crisp, benefit-led landing page following industry best
  practices: one-line value proposition, the three key benefits up front, a
  minimal "how to start" path, and links out to detail rather than inlining it.
- Lead with the three differentiators: **safe unattended runs in ephemeral,
  isolated environments**, **cost control** (bring-your-own-key, no token
  reselling, near-zero maintainer cost), and **composability into bigger
  workflows**.
- Fix the broken `DESIGN.md` links — point to the canonical design doc, or
  surface a top-level design pointer, so no link 404s.
- Move long-form detail out of the README into linked markdown: keep the
  "Fine-tuning for your stack" table and adopter mechanics in dedicated docs under
  `docs/`, referenced from the README.
- Consolidate the existing documentation set (`README.md`, `backend/README.md`,
  `docs/protect-main.md`, `openspec/_planning/HIGH-LEVEL-DESIGN.md`) into a clear
  hierarchy with a single authoritative source per topic and no duplicated or
  contradictory content; establish a `docs/` index the README links to.
- Audit every cross-document link and the domain references (`specfly.dev`) for
  correctness after the move.

## Capabilities

### New Capabilities
- `project-docs`: The contract for Specfly's public documentation set — what the
  README must communicate (benefit-led landing content), the documentation
  hierarchy (single authoritative source per topic, a docs index), and link
  integrity (no broken cross-document or design links). This makes the branding
  pass verifiable and gives R12 a stable content contract to render from.

### Modified Capabilities
<!-- None — no behavioral requirement of any existing product capability (apply-dispatch, webhook-gateway, apply-runner, pr-authoring, ephemeral-state, apply-concurrency, apply-trigger-command) changes. This is a documentation/branding change. -->

## Impact

- **Docs**: `README.md` (rewrite), `backend/README.md` (de-duplicate against the
  consolidated set), `docs/protect-main.md` (link from the new index), a new or
  relocated top-level design pointer, and a new `docs/` index/landing structure.
- **No code, API, workflow, or dependency changes.** `apply.yml`,
  `examples/adopter-workflow.yml`, the backend, and all behavioral specs are
  untouched.
- **Downstream**: R12 (`specfly.dev` static landing page) consumes this README as
  its source content, so the consolidated structure is a prerequisite for that
  work.
