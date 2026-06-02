# Specfly documentation

| Doc | What it covers |
| --- | --- |
| [Design overview](design.md) | How Specfly is built and why — control plane / data plane, identity & security model. Links to the canonical [`HIGH-LEVEL-DESIGN.md`](../openspec/_planning/HIGH-LEVEL-DESIGN.md). |
| [Getting started](getting-started.md) | The full adopter setup — install the App, add the key, wire the caller workflow, copy the command file, and the per-change usage flow. |
| [Fine-tuning for your stack](fine-tuning.md) | How the agent provisions your environment, and what to document in `CLAUDE.md` / `AGENTS.md` for less common toolchains. |
| [Protecting `main`](protect-main.md) | The branch ruleset that keeps unreviewed code off `main` — UI walkthrough plus a copy-paste `gh` command. |
| [Backend reference](../backend/README.md) | Control-plane engineering reference — endpoints, layout, runbook for the Cloudflare Worker. |
| [Site deploy runbook](site-deploy.md) | Deploy, verify, and roll back the public landing page at `specfly.dev` (Cloudflare Workers static assets). |

The top-level [README](../README.md) is the benefit-led landing page.
