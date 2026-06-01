## Context

Specfly's documentation today is four overlapping markdown files with no stated
hierarchy:

- `README.md` (~100 lines) — landing content, but setup-heavy and benefit-light;
  links twice to a non-existent root `DESIGN.md`.
- `openspec/_planning/HIGH-LEVEL-DESIGN.md` — the actual authoritative design
  (vision, architecture, security model, cost, comparison to remcc).
- `backend/README.md` — control-plane internals + maintainer deploy runbook.
- `docs/protect-main.md` — adopter branch-protection guide.

R2 is a content/branding pass: make the README a crisp, benefit-led landing page
and consolidate the rest into a clear hierarchy. R12 will later render the README
as the `specfly.dev` static page, so the README must read as standalone marketing
content, not a setup manual. No code changes.

## Goals / Non-Goals

**Goals:**

- A README that communicates value in the first screenful: one-line pitch, the
  three key benefits (safe unattended runs in ephemeral isolated environments,
  cost control, composability), then a short "how to start".
- Every link resolves — no broken `DESIGN.md` reference.
- One authoritative source per topic; long-form detail lives in linked `docs/`
  files, not inline in the README.
- Content structured so R12 can lift it onto the landing page with minimal edits.

**Non-Goals:**

- No product, workflow, backend, or spec behavior changes.
- Not building the `specfly.dev` static site (that is R12).
- Not rewriting `backend/README.md`'s internals/runbook beyond removing
  duplication and fixing links — it stays the engineering reference.

## Decisions

**1. README is benefit-led and short; detail is linked.**
Restructure to: title + one-line pitch → status note → **three benefits** (the
selling points from the roadmap) → "How it works" (keep the existing diagram,
trimmed) → "Get started" (the 5-step adopter path, condensed) → links to detail.
Move the long "Fine-tuning for your stack" table out of the README into a
dedicated `docs/` doc and link to it. Rationale: best-practice READMEs front-load
why-you-care and defer how-to-the-last-mile; R12 needs marketing copy, not a
manual. Alternative considered — keep everything inline — rejected: it is what
makes the page setup-heavy and hard to reuse as a landing page.

**2. Fix the design link by pointing at the canonical doc, not creating a stub.**
Replace `[DESIGN.md](DESIGN.md)` with a working link. Decision: add a thin
top-level `DESIGN.md` (or `docs/design.md`) that is a short overview + a pointer
to `openspec/_planning/HIGH-LEVEL-DESIGN.md`, OR link the README directly to the
planning doc. Prefer a short top-level `docs/design.md` so external readers (and
R12) are not sent into `openspec/_planning/`, keeping the planning dir internal.
Alternative — move HIGH-LEVEL-DESIGN.md to the root — rejected: it is an OpenSpec
planning artifact and should stay there; we surface a public-facing summary
instead.

**3. Establish a `docs/` index as the documentation hub.**
Add `docs/README.md` (or a "Documentation" section in the root README) that lists
and links every doc with one line each: design overview, fine-tuning for your
stack, protecting main, backend/control-plane reference. Single navigation point;
each topic has exactly one home. Alternative — flat links scattered in the README
— rejected: no single map, easy to drift.

**4. De-duplicate, don't merge.**
`backend/README.md` and HIGH-LEVEL-DESIGN.md overlap on the security/identity
model. Keep HIGH-LEVEL-DESIGN.md (and the public design summary) as the
authoritative narrative; trim backend/README.md to engineering specifics
(endpoints, layout, runbook) and link back rather than restating the rationale.

**5. Audit links and domain references as a final step.**
After the moves, grep every relative markdown link and every `specfly.dev` /
`DESIGN.md` reference and confirm each resolves. Cheap insurance against the exact
class of bug this change fixes.

## Risks / Trade-offs

- **Over-trimming the README loses adopter onboarding detail** → Move it, don't
  delete it: the full 5-step setup and the fine-tuning table live in linked
  `docs/` files, reachable in one click from "Get started".
- **A new top-level `DESIGN.md`/`docs/design.md` becomes a second source that
  drifts from HIGH-LEVEL-DESIGN.md** → Keep it deliberately thin (overview +
  pointer), with the planning doc as the single authoritative source it links to.
- **R12 assumptions** → Structure the README so sections map cleanly to landing
  blocks, but do not pre-build any site-specific markup here; keep it portable
  markdown.

## Open Questions

- Public design surface: a root `DESIGN.md` vs `docs/design.md` — resolve to
  `docs/design.md` to keep all public docs under `docs/`, unless the README's
  prominent "settled architecture" link reads better at the root.
