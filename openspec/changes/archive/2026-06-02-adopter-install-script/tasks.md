## 1. Installer scaffold & preflight

- [x] 1.1 Create `install.sh` at the repo root with a `bash` shebang, `set -euo pipefail`, a short usage/header comment, and a `--yes`/`--non-interactive` flag plus TTY detection (`[ -t 0 ]`) feeding a single `INTERACTIVE` decision.
- [x] 1.2 Implement preflight: assert `git` and `gh` are installed (`command -v`), `gh auth status` succeeds, the CWD is inside a git repo, and `origin` resolves to a GitHub repo (`gh repo view`); on any failure print the exact remediation command and exit non-zero before any mutation.
- [x] 1.3 Add small helpers: `confirm <prompt>` (respects `INTERACTIVE`/`--yes`; never auto-confirms destructive actions in non-interactive mode), `info`/`warn`/`step` log helpers, and a `RESOURCE_REF` constant pinning the source ref (`v1`).

## 2. Source-of-truth file fetch

- [x] 2.1 Implement `obtain_file <repo-path>`: read from local disk when run from a specfly checkout, else fetch from the pinned ref via raw GitHub; on failure return non-zero (no partial output).
- [x] 2.2 Wire `obtain_file` for `examples/adopter-workflow.yml` and `.claude/commands/sfx/apply.md`; on fetch failure stop with the manual copy-paste fallback rather than writing partial/stale content.

## 3. Idempotent file authoring

- [x] 3.1 Implement `write_file <target> <content>`: if absent, write; if identical, report "already present" and skip; if differing, show a diff and prompt (default keep existing); never force-write.
- [x] 3.2 Author `.github/workflows/specfly.yml` from the obtained adopter-workflow content via `write_file`.
- [x] 3.3 Author `.claude/commands/sfx/apply.md` from the obtained command-file content via `write_file`.

## 4. Secret configuration

- [x] 4.1 Check for an existing `ANTHROPIC_API_KEY` secret (`gh secret list`); when present, `confirm` before overwriting.
- [x] 4.2 Set the secret via `gh secret set ANTHROPIC_API_KEY` reading the value from `$ANTHROPIC_API_KEY` if set, else a no-echo `read -rs` prompt; never print/log the value.

## 5. Guided manual steps

- [x] 5.1 OpenSpec check: if no `openspec/` directory exists, explain it is the hard prerequisite and print install + `openspec init` guidance; pause for confirmation (interactive) or list it (non-interactive).
- [x] 5.2 GitHub App step: print `https://github.com/apps/specfly`, pause for the user to confirm install, and state plainly the installer cannot verify it and that it is the first thing to check if `/sfx:apply` produces no run.
- [x] 5.3 API-key step: point the user to where to create an Anthropic key, sequenced before/with the secret step.

## 6. Optional branch protection

- [x] 6.1 List rulesets (`gh api /repos/{owner}/{repo}/rulesets`); skip with a report when one already targets the default branch.
- [x] 6.2 When none exists, `confirm` then create the ruleset via `gh api --method POST ... --input -` using the exact JSON from `docs/protect-main.md` (PR + 1 approval, deletion, non_fast_forward, empty `bypass_actors`); never add `Specfly[bot]`; never edit an existing ruleset; skip the mutation in non-interactive mode and print it instead.

## 7. Final summary

- [x] 7.1 Print a summary of files written/skipped (and why), the secret outcome, the ruleset outcome, and the manual items still owed (App install it can't confirm, OpenSpec init if pending), ending with the `/sfx:apply` usage entry point.

## 8. Docs & roadmap

- [x] 8.1 README "Get started": lead with the one-line installer (`curl -fsSL https://specfly.dev/install.sh | bash`) and keep the manual steps as the documented fallback.
- [x] 8.2 `docs/getting-started.md` "One-time setup": add the installer as the primary path; note the `gh` (authenticated) + `git` prerequisites; retain the manual steps below it.
- [x] 8.3 Tick R13 in `openspec/_planning/.roadmap.md`.

## 9. Verify

- [x] 9.1 `openspec validate adopter-install-script` passes.
- [x] 9.2 `bash -n install.sh` (syntax) and a shellcheck pass are clean; a dry preflight on a non-git dir exits with guidance and mutates nothing.
- [x] 9.3 Idempotency smoke: run twice against a test adopter repo (e.g. `foster-systems/foster-systems`) — the second run reports everything already present and mutates nothing.
