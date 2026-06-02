## Why

Adopter onboarding is six manual steps (getting-started §1–5 + protect-main):
install OpenSpec, install the GitHub App, add the `ANTHROPIC_API_KEY` secret, copy
a caller workflow, copy a command file, and apply a branch ruleset. Four of those
are pure mechanics that a script can do with the `gh` CLI; two genuinely need a
human in a browser. Today every adopter retypes the `gh secret set` / `gh api`
incantations by hand and copy-pastes file contents, which is slow and error-prone.
A single guided installer should automate the mechanical steps and walk the user
through only what can't be automated.

## What Changes

- Add a **shell installer** `install.sh` (committed at the specfly repo root,
  runnable from inside an adopter's repo clone via
  `curl -fsSL https://specfly.dev/install.sh | bash` or directly) that drives the
  one-time adopter setup end to end.
- The installer **automates** the mechanical steps via the `gh` CLI:
  - write the caller workflow `.github/workflows/specfly.yml` (from the pinned
    `examples/adopter-workflow.yml`),
  - write the command file `.claude/commands/sfx/apply.md`,
  - set the `ANTHROPIC_API_KEY` Actions secret (`gh secret set`),
  - offer to apply the `main`-protection ruleset (`gh api`, the exact JSON from
    `docs/protect-main.md`), prompting before mutating repo settings.
- The installer **guides** the steps it cannot automate, pausing for explicit
  confirmation at each: installing OpenSpec + `openspec init` (the hard
  prerequisite), installing the **Specfly GitHub App** in a browser, and obtaining
  an Anthropic API key. It prints the URLs and waits.
- The installer is **safe to re-run** (idempotent): it detects existing files,
  secrets, and rulesets and skips or asks before overwriting; it never force-writes.
- The installer **preflights** its own requirements first (`gh` present and
  authenticated; inside a git repo with a GitHub `origin`) and fails fast with
  actionable guidance, mutating nothing on failure.
- Update adopter docs (README "Get started", `docs/getting-started.md`) to lead with
  the one-line installer and keep the manual steps as the fallback; tick **R13** on
  the roadmap.

## Capabilities

### New Capabilities

- `adopter-install-script`: a guided shell installer that performs the mechanical
  one-time Specfly setup for an adopter repo (caller workflow, command file,
  `ANTHROPIC_API_KEY` secret, optional `main` ruleset) via the `gh` CLI, and walks
  the user step-by-step through the browser-only steps it cannot automate (OpenSpec
  init, GitHub App install, API-key creation). Preflighted, idempotent, fail-fast.

### Modified Capabilities

<!-- None. The trigger contract (apply-dispatch, apply-trigger-command) and the
     reusable workflow are unchanged: the installer only writes the same adopter
     files and settings the docs already prescribe. -->

## Impact

- **New file** (specfly repo): `install.sh` at the repo root (the source of truth;
  served at `specfly.dev/install.sh` once R12 ships, fetchable from raw GitHub
  meanwhile).
- **Docs**: `README.md` ("Get started"), `docs/getting-started.md` ("One-time
  setup"), `openspec/_planning/.roadmap.md` (tick R13).
- **Adopter prerequisites**: the installer requires the `gh` CLI (authenticated) and
  `git`; it documents this and checks for it.
- **No backend / TypeScript changes**; no new secrets beyond the existing
  `ANTHROPIC_API_KEY`; the adopter footprint written is exactly the two files the
  docs already prescribe.
