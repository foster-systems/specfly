# Specfly — design overview

Specfly is the thin orchestration layer that turns *"push an OpenSpec change"*
into *"get a reviewable pull request"* — without tethering your laptop or running
any infrastructure of your own.

## The shape of it

A hosted **control plane** (a GitHub App + a tiny Cloudflare Workers backend)
dispatches work into **your own data plane** (your GitHub Actions runner):

```
  ┌─────────────────────────────┐         ┌──────────────────────────────────┐
  │  YOUR REPO (data plane)      │         │  SPECFLY (control plane)          │
  │                              │         │                                   │
  │  push /sfx:apply…       ─────┼────────▶│  GitHub App webhook               │
  │  on change/<name>            │         │    → repository_dispatch          │
  │  runner runs /opsx:apply ◀───┼─────────┤                                   │
  │    - checkout + provision    │         │                                   │
  │    - run Claude Code         │         │                                   │
  │    - push change/<name>  ────┼────────▶│  App opens/updates the PR as      │
  │                              │         │  Specfly[bot]  (a separate actor) │
  │  you review → approve → merge│         │                                   │
  └─────────────────────────────┘         └──────────────────────────────────┘
```

The expensive work — cloning the repo and running Claude Code on your Anthropic
key — happens entirely in **your** Actions. The backend only routes the trigger
event and authors the PR; it never holds your source, your compute, or your key.

## Why it's built this way

- **Safe unattended runs.** The runner uses only the job's built-in
  `GITHUB_TOKEN` (single-repo, expires with the job). A `main` branch ruleset —
  which *you* own — is what actually fences unreviewed code off `main`, enforced
  by GitHub server-side regardless of any token's scope.
- **Approvable PRs that still trigger CI.** The PR is authored by `Specfly[bot]`,
  a distinct actor, so a solo maintainer can legitimately approve it — and unlike
  a `GITHUB_TOKEN`-authored PR, an App-authored PR *does* trigger your CI.
- **Near-zero maintainer cost.** The backend is a webhook router, not a compute
  host, so its cost stays nearly flat as adoption grows.

## The authoritative design

The full vision, architecture, identity & security model, cost model, comparison
to [remcc](https://github.com/foster-systems/remcc), and the resolved open
questions live in the canonical planning document:

**[`openspec/_planning/HIGH-LEVEL-DESIGN.md`](../openspec/_planning/HIGH-LEVEL-DESIGN.md)**

This overview is intentionally thin; the planning document is the single source
of truth it summarizes.
