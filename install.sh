#!/usr/bin/env bash
#
# Specfly installer — guided one-time adopter setup.
#
# Run from inside a clone of your GitHub repo:
#   curl -fsSL https://specfly.dev/install.sh | bash
#   bash install.sh [--yes|--non-interactive]
#
# It automates the mechanical steps via the `gh` CLI (caller workflow,
# /sfx:apply command file, ANTHROPIC_API_KEY secret, optional main ruleset)
# and guides you through the browser-only steps it cannot automate (OpenSpec
# init, Specfly GitHub App install, Anthropic API-key creation). It is safe to
# re-run: it skips what is already in place and never force-writes.
#
# Prerequisites: an authenticated `gh` CLI and `git`, run inside a clone whose
# `origin` points at your GitHub repo.

set -euo pipefail

RESOURCE_REF="v1"
SPECFLY_REPO="foster-systems/specfly"
RAW_BASE="https://raw.githubusercontent.com/${SPECFLY_REPO}/${RESOURCE_REF}"

# --- interactivity decision -------------------------------------------------
# A single INTERACTIVE flag drives every prompt. It is false when stdin is not
# a terminal (e.g. `curl | bash`) or when --yes/--non-interactive is passed. In
# that mode the installer does the unambiguous mechanical steps but never
# auto-confirms destructive overwrites or repo-settings mutations.
INTERACTIVE=true
for arg in "$@"; do
  case "$arg" in
    --yes|-y|--non-interactive) INTERACTIVE=false ;;
    -h|--help)
      sed -n '2,20p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'ERROR: unknown argument: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done
[ -t 0 ] || INTERACTIVE=false

# Maintainer/dev convenience: when this script is invoked as
# `bash /path/to/specfly-checkout/install.sh`, the source files sit next to it
# and we read them from disk so an in-progress copy can be tested without first
# pushing it to a ref. NOTE this disk copy is whatever is checked out, not
# necessarily the pinned ref. Adopters use `curl | bash`, where SCRIPT_DIR is
# empty and everything is fetched from RESOURCE_REF — the adopter-facing path.
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

# --- log helpers ------------------------------------------------------------
info() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
err()  { printf 'ERROR: %s\n' "$*" >&2; }
step() { printf '\n==> %s\n' "$*"; }

# confirm <prompt> — interactive yes/no, default No. In non-interactive mode it
# always declines, so it can gate destructive actions without auto-confirming.
confirm() {
  [ "$INTERACTIVE" = true ] || return 1
  local reply
  read -r -p "$1 [y/N] " reply || return 1
  case "$reply" in [yY] | [yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# --- summary accumulators ---------------------------------------------------
WRITTEN=()
SKIPPED=()
SECRET_OUTCOME="not attempted"
RULESET_OUTCOME="not attempted"
OPENSPEC_PENDING=false

# --- preflight --------------------------------------------------------------
preflight() {
  step "Preflight"
  command -v git  >/dev/null 2>&1 || { err "git is not installed — see https://git-scm.com/downloads"; exit 1; }
  command -v gh   >/dev/null 2>&1 || { err "GitHub CLI (gh) is not installed — see https://cli.github.com"; exit 1; }
  command -v curl >/dev/null 2>&1 || { err "curl is not installed — install it and re-run."; exit 1; }
  if ! gh auth status >/dev/null 2>&1; then
    err "gh is not authenticated. Run: gh auth login"
    exit 1
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    err "Not inside a git repository. cd into your repo clone and re-run."
    exit 1
  fi
  if ! REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"; then
    err "Could not resolve a GitHub repo from 'origin'. Ensure 'origin' points at a GitHub repo (gh repo view)."
    exit 1
  fi
  DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || true)"
  [ -n "$DEFAULT_BRANCH" ] || DEFAULT_BRANCH="main"
  info "  git, gh present and authenticated"
  info "  repo: $REPO_SLUG (default branch: $DEFAULT_BRANCH)"
}

# --- source-of-truth obtain -------------------------------------------------
# obtain_file <repo-path> — print the file's content to stdout. For adopters
# this fetches the pinned ref via raw GitHub; the local-disk branch is the
# maintainer dev convenience documented at SCRIPT_DIR above. Returns non-zero
# with no partial output on failure.
obtain_file() {
  local path="$1"
  if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/${path}" ]; then
    cat "${SCRIPT_DIR}/${path}"
    return 0
  fi
  curl -fsSL "${RAW_BASE}/${path}"
}

fetch_failure() {
  err "Could not obtain '$1' from ${SPECFLY_REPO}@${RESOURCE_REF}."
  err "You may be offline or the ref moved. Set up the two files manually instead:"
  err "  docs/getting-started.md  →  steps 3 (caller workflow) and 4 (command file)"
  err "Nothing was written."
  exit 1
}

# --- idempotent file authoring ----------------------------------------------
# write_file <target> <content> — write when absent; skip when identical; on a
# differing existing file, show a diff and prompt (default: keep existing).
# Never force-writes. Content is compared trailing-newline-insensitively so a
# re-run on a file we authored reports "already present".
write_file() {
  local target="$1" content="$2"
  if [ ! -e "$target" ]; then
    mkdir -p "$(dirname "$target")"
    printf '%s\n' "$content" > "$target"
    info "  wrote $target"
    WRITTEN+=("$target")
    return 0
  fi
  local existing
  existing="$(cat "$target")"
  if [ "$existing" = "$content" ]; then
    info "  already present: $target (identical) — skipping"
    SKIPPED+=("$target (identical)")
    return 0
  fi
  warn "  $target exists and differs from the Specfly source:"
  local tmp
  tmp="$(mktemp)"
  printf '%s\n' "$content" > "$tmp"
  diff -u "$target" "$tmp" || true
  rm -f "$tmp"
  if confirm "Overwrite $target with the Specfly version?"; then
    printf '%s\n' "$content" > "$target"
    info "  overwrote $target"
    WRITTEN+=("$target")
  else
    info "  kept your existing $target"
    SKIPPED+=("$target (kept your version)")
  fi
}

author_files() {
  step "Caller workflow & /sfx:apply command file"
  local workflow_content command_content
  workflow_content="$(obtain_file "examples/adopter-workflow.yml")" || fetch_failure "examples/adopter-workflow.yml"
  command_content="$(obtain_file ".claude/commands/sfx/apply.md")"   || fetch_failure ".claude/commands/sfx/apply.md"
  write_file ".github/workflows/specfly.yml" "$workflow_content"
  write_file ".claude/commands/sfx/apply.md" "$command_content"
}

# --- secret -----------------------------------------------------------------
set_secret() {
  local key="${ANTHROPIC_API_KEY:-}"
  if [ -z "$key" ]; then
    if [ "$INTERACTIVE" != true ]; then
      warn "  ANTHROPIC_API_KEY not in the environment and not interactive — skipping."
      warn "  Set it later: gh secret set ANTHROPIC_API_KEY --repo $REPO_SLUG"
      SECRET_OUTCOME="skipped (no value — set it manually)"
      return 0
    fi
    info "  Create a key at https://console.anthropic.com/settings/keys"
    read -r -s -p "  Paste ANTHROPIC_API_KEY (input hidden): " key
    printf '\n'
  fi
  if [ -z "$key" ]; then
    warn "  empty value — skipping the secret."
    SECRET_OUTCOME="skipped (empty value)"
    return 0
  fi
  printf '%s' "$key" | gh secret set ANTHROPIC_API_KEY --repo "$REPO_SLUG" >/dev/null
  info "  ANTHROPIC_API_KEY set on $REPO_SLUG."
  SECRET_OUTCOME="set"
}

configure_secret() {
  step "ANTHROPIC_API_KEY Actions secret"
  if gh secret list --repo "$REPO_SLUG" 2>/dev/null | grep -q '^ANTHROPIC_API_KEY[[:space:]]'; then
    info "  ANTHROPIC_API_KEY already set on $REPO_SLUG."
    if confirm "Overwrite the existing ANTHROPIC_API_KEY secret?"; then
      set_secret
    else
      info "  keeping the existing secret."
      SECRET_OUTCOME="kept existing"
    fi
  else
    set_secret
  fi
}

# --- guided manual steps ----------------------------------------------------
guide_openspec() {
  step "OpenSpec prerequisite"
  if [ -d openspec ]; then
    info "  openspec/ present — OpenSpec looks initialised."
    return 0
  fi
  OPENSPEC_PENDING=true
  warn "  No openspec/ directory found."
  warn "  OpenSpec is the hard prerequisite — /sfx:apply has nothing to act on without it."
  info "  Install:  https://github.com/Fission-AI/OpenSpec"
  info "  Then run: openspec init   (and commit the openspec/ directory)"
  if [ "$INTERACTIVE" = true ]; then
    read -r -p "  Press Enter to continue (set up OpenSpec before your first /sfx:apply)… " _
  fi
}

guide_app_install() {
  step "Install the Specfly GitHub App (browser-only)"
  info "  Open https://github.com/apps/specfly and install it on $REPO_SLUG."
  warn "  This installer CANNOT verify the App is installed."
  warn "  If a later /sfx:apply produces no run, check this FIRST."
  if [ "$INTERACTIVE" = true ]; then
    read -r -p "  Press Enter once you've installed the App… " _
  fi
}

# --- optional branch protection ---------------------------------------------
ruleset_json() {
  cat <<'JSON'
{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    }
  ],
  "bypass_actors": []
}
JSON
}

create_ruleset() {
  if ruleset_json | gh api --method POST "/repos/$REPO_SLUG/rulesets" --input - >/dev/null 2>&1; then
    info "  created the 'Protect main' ruleset on $REPO_SLUG."
    RULESET_OUTCOME="created"
  else
    warn "  could not create the ruleset (insufficient permissions or plan limit)."
    warn "  Apply it manually — see docs/protect-main.md."
    RULESET_OUTCOME="failed (apply manually)"
  fi
}

configure_ruleset() {
  step "Protect the default branch ($DEFAULT_BRANCH)"
  local ids id includes protecting_name="" protects_default=false
  ids="$(gh api "/repos/$REPO_SLUG/rulesets" --jq '.[] | select(.target=="branch") | .id' 2>/dev/null || true)"
  for id in $ids; do
    includes="$(gh api "/repos/$REPO_SLUG/rulesets/$id" --jq '.conditions.ref_name.include[]?' 2>/dev/null || true)"
    if printf '%s\n' "$includes" | grep -qx -e '~DEFAULT_BRANCH' -e "refs/heads/$DEFAULT_BRANCH" -e "$DEFAULT_BRANCH"; then
      protects_default=true
      protecting_name="$(gh api "/repos/$REPO_SLUG/rulesets/$id" --jq '.name' 2>/dev/null || echo '?')"
      break
    fi
  done

  if [ "$protects_default" = true ]; then
    info "  a ruleset already protects $DEFAULT_BRANCH (\"$protecting_name\") — leaving it untouched."
    RULESET_OUTCOME="already protected (left untouched)"
    return 0
  fi
  if [ "$INTERACTIVE" != true ]; then
    info "  Non-interactive: not changing repo settings. To protect $DEFAULT_BRANCH, run:"
    info "    gh api --method POST /repos/$REPO_SLUG/rulesets --input - <<'JSON'"
    ruleset_json | sed 's/^/    /'
    info "    JSON"
    RULESET_OUTCOME="skipped (non-interactive — command printed)"
    return 0
  fi
  if confirm "Create the 'Protect main' ruleset (PR + 1 approval, no force-push, no deletion)?"; then
    create_ruleset
  else
    info "  skipped ruleset creation."
    RULESET_OUTCOME="declined"
  fi
}

# --- final summary ----------------------------------------------------------
summary() {
  step "Summary"
  info "Repo: $REPO_SLUG"
  if [ "${#WRITTEN[@]}" -gt 0 ]; then
    info "Files written:"
    for f in "${WRITTEN[@]}"; do info "  + $f"; done
  fi
  if [ "${#SKIPPED[@]}" -gt 0 ]; then
    info "Files skipped:"
    for f in "${SKIPPED[@]}"; do info "  · $f"; done
  fi
  info "Secret (ANTHROPIC_API_KEY): $SECRET_OUTCOME"
  info "Branch ruleset: $RULESET_OUTCOME"

  info ""
  info "Still owed by you (this installer cannot do or verify these):"
  info "  • Install the Specfly App at https://github.com/apps/specfly — UNVERIFIABLE here;"
  info "    if /sfx:apply produces no run, this is the first thing to check."
  if [ "$OPENSPEC_PENDING" = true ]; then
    info "  • Initialise OpenSpec: install it, run 'openspec init', commit openspec/."
  fi
  if [ "$SECRET_OUTCOME" != "set" ] && [ "$SECRET_OUTCOME" != "kept existing" ]; then
    info "  • Set the ANTHROPIC_API_KEY secret: gh secret set ANTHROPIC_API_KEY --repo $REPO_SLUG"
  fi

  info ""
  info "Then, per change: run  /sfx:apply [<name>]  to trigger a remote apply."
}

# --- main -------------------------------------------------------------------
main() {
  info "Specfly installer (${SPECFLY_REPO}@${RESOURCE_REF})"
  [ "$INTERACTIVE" = true ] || info "(non-interactive mode: settings mutations will be printed, not applied)"
  preflight
  guide_openspec
  author_files
  configure_secret
  guide_app_install
  configure_ruleset
  summary
}

main "$@"
