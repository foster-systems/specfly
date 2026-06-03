# Getting started with Specfly

> **Status: early development.** This is the full adopter setup. Specfly is being
> built in the open and is not yet ready for general adoption.

## Prerequisites

- An **OpenSpec-initialised** repo with `.claude/` committed. OpenSpec is the one
  hard prerequisite — `/opsx:apply` has nothing to act on without it.
- An **Anthropic API key** (you bring your own; Specfly never resells tokens).

Any language or toolchain works — Specfly makes no assumption about your package
manager. The agent provisions the project environment itself; document anything
non-obvious in `CLAUDE.md` / `AGENTS.md` (see
[Fine-tuning for your stack](fine-tuning.md)).

## One-time setup

### Quickstart — the installer

From inside a clone of your GitHub repo, with an authenticated
[`gh` CLI](https://cli.github.com) and `git` available:

```bash
curl -fsSL https://specfly.dev/install.sh | bash
```

The installer automates the mechanical steps below (the caller workflow, the
`/sfx:apply` command file, the `ANTHROPIC_API_KEY` secret, and — on confirmation
— the `main` ruleset) and pauses to guide you through the browser-only steps it
cannot automate (installing OpenSpec, installing the Specfly App, creating an
Anthropic key). It preflights its requirements, makes no changes if they are
unmet, and is safe to re-run. The manual steps below remain the documented
fallback.

> **Prerequisites for the installer:** an authenticated `gh` CLI and `git`, run
> from inside your repo clone (its `origin` must point at your GitHub repo).

### Manual steps

### 1. Install the Specfly App

Install it at [`github.com/apps/specfly`](https://github.com/apps/specfly) and
pick your repo(s). You install the maintainer's App — you never create an App, and
there is no App ID / private key / slug secret to manage.

### 2. Add one secret

Add `ANTHROPIC_API_KEY` in your repo under **Settings → Secrets and variables →
Actions**. Bring your own key.

### 3. Add one caller workflow

Commit a thin caller workflow (see
[`examples/adopter-workflow.yml`](../examples/adopter-workflow.yml)):

```yaml
# .github/workflows/specfly.yml
name: Specfly Apply
on:
  repository_dispatch:        # fired BY the Specfly backend, never locally
    types: [specfly-apply]
permissions:
  contents: write             # push the change branch; the main ruleset fences off main
jobs:
  apply:
    uses: foster-systems/specfly/.github/workflows/apply.yml@v1
    with:
      change: ${{ github.event.client_payload.change }}
    secrets:
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

This caller maps the backend's `client_payload` onto the reusable `apply.yml`
inputs. Upgrading later is just bumping `@v1` → `@v2`.

### 4. Copy one command file

Copy `.claude/commands/sfx/apply.md` into your repo. Then `/sfx:apply <name>` is
how you **trigger an apply** — it crafts the trigger commit and pushes it.

> Distinct from `/opsx:apply`, which implements a change's tasks **locally**.

### 5. (Strongly recommended) Protect `main`

Specfly never requests admin rights, so it cannot configure this for you —
protecting `main` is a one-time setup you own. It is the control that actually
keeps unreviewed code off `main`. Follow **[Protecting `main`](protect-main.md)**
(a UI walkthrough plus a single copy-paste `gh` command).

## Usage flow (per change)

1. Design and plan the change locally (e.g. `claude /opsx:propose`). The work
   lives on a `change/<name>` branch; ordinary WIP pushes are free and silent.
2. When ready, run **`/sfx:apply`**. It produces a commit whose subject starts with
   `/sfx:apply` and pushes it; the backend matches the branch + prefix and
   dispatches the run.
3. The runner runs `/opsx:apply`, pushes the result to `change/<name>`, and the
   backend opens the PR as **`Specfly[bot]`** — a separate actor, so you can
   approve it and your CI triggers. No PR exists before apply completes.
4. Review the PR. Re-run `/sfx:apply` to push more commits; the existing PR
   updates in place.
5. Archive the change (`claude /opsx:archive`), push, then approve and merge.

For the full architecture and rationale, see the
[design overview](design.md).
