<div align="center">

# Specfly

**Push an OpenSpec change, get a reviewable pull request — from a GitHub-hosted Claude Code run.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Powered by Claude Code](https://img.shields.io/badge/powered%20by-Claude%20Code-6f42c1.svg)](https://claude.com/claude-code)

</div>

> **Status: early development.** The architecture is settled (see [DESIGN.md](DESIGN.md))
> and this repo is being built in the open. Not yet ready for general adoption.

Specfly runs Claude Code's `/opsx:apply` on *your own* GitHub Actions runner and
opens a PR for your review — no laptop tether, and almost no setup. It's the
successor to [remcc](https://github.com/foster-systems/remcc), redesigned to make
adoption a few clicks instead of a custom GitHub App per repo.

## How it works

A hosted **control plane** (a GitHub App + a tiny backend) dispatches work into
*your* **data plane** (your Actions runner). The expensive part — cloning and
running Claude Code — happens in your Actions on your Anthropic key. Specfly only
routes the trigger and authors the PR.

```
  push a commit "@spec:apply…" on change/<name>  →  Specfly App (push webhook)
     →  repository_dispatch  →  your runner runs /opsx:apply + pushes the result
     →  Specfly[bot] opens the PR (once apply completes)  →  you review, approve, merge
```

Because the PR is authored by `Specfly[bot]` (a separate actor), you can approve
it yourself and your CI still triggers.

## Adopter setup (planned)

1. **Install the Specfly App** at `github.com/apps/specfly` (pick your repos).
2. **Add one secret** — `ANTHROPIC_API_KEY` (bring your own key).
3. **Add one workflow file** — see [`examples/adopter-workflow.yml`](examples/adopter-workflow.yml):

   ```yaml
   # .github/workflows/specfly.yml
   name: Specfly Apply
   on:
     repository_dispatch:
       types: [specfly-apply]
   permissions:
     contents: write
   jobs:
     apply:
       uses: foster-systems/specfly/.github/workflows/apply.yml@v1
       with:
         change: ${{ github.event.client_payload.change }}
       secrets:
         anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

4. **(Recommended) Protect `main`** — require a PR + 1 approval, block direct
   pushes. Documented, not auto-configured (Specfly never asks for admin rights):
   **[docs/protect-main.md](docs/protect-main.md)** (UI walkthrough + one `gh` command).

## Scope

Free and open. No billing, no token reselling, no custody of your source or
compute — it all stays in your runner on your key. Claude Code + GitHub Actions +
OpenSpec `/opsx:apply`, pnpm- or bun-managed repos. See [DESIGN.md](DESIGN.md) for
the full architecture, security model, and open questions.

## License

[MIT](LICENSE) © Foster Systems
