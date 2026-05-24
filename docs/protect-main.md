# Protecting `main` (adopter guide)

Specfly **does not** configure your repository for you — it never requests admin
permissions. Protecting your default branch is a one-time setup you own. This guide
gives you two ways to do it: a click-by-click UI walkthrough and a single
copy-paste `gh` command.

## Why this matters

Specfly's runner pushes a `change/<name>` branch and the Specfly App opens a PR as
`Specfly[bot]`. The control that keeps **unreviewed code from landing on `main`** is
*not* the token scope — it's this branch ruleset, enforced by GitHub server-side
regardless of how capable any token is. The ruleset does three things:

- **Requires a pull request before merging** (which also blocks direct pushes to
  the default branch).
- **Requires 1 approving review.**
- **Blocks force pushes and branch deletion.**

Because the PR is authored by `Specfly[bot]` — a separate actor from you — **you can
approve it yourself** and then merge (GitHub only forbids approving your *own* PRs).
That's how a solo maintainer satisfies the "1 approval" rule legitimately.

> ⚠️ **The one rule you must not break:** never add `Specfly[bot]` to the ruleset's
> **bypass list**. If the bot could bypass the rules, it could merge its own
> unreviewed PRs and this entire safeguard collapses.

---

## Option A — UI walkthrough

1. In your repo, go to **Settings → Rules → Rulesets**.
2. Click **New ruleset → New branch ruleset**.
3. **Ruleset Name:** `Protect main` (any name).
4. **Enforcement status:** **Active**.
5. **Bypass list:** leave it **empty**. Do **not** add `Specfly[bot]`. (See the note
   on admin bypass below if you want an emergency escape hatch for yourself.)
6. **Target branches:** click **Add target → Include default branch** (or **Add by
   pattern** and enter `main`).
7. Under **Branch rules**, enable:
   - ☑ **Restrict deletions**
   - ☑ **Block force pushes**
   - ☑ **Require a pull request before merging** → set **Required approvals** to **1**.
   - *(Optional)* ☑ **Require status checks to pass** → add your CI check (see below).
8. Click **Create**.

Direct pushes to the default branch are now rejected — changes must go through a PR.

---

## Option B — one `gh` command

Run this from inside a clone of your repo (the `{owner}`/`{repo}` placeholders are
filled in automatically by `gh`):

```bash
gh api --method POST /repos/{owner}/{repo}/rulesets --input - <<'JSON'
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
```

`~DEFAULT_BRANCH` targets whatever your default branch is named (`main`, `master`,
…). `"bypass_actors": []` means **no one bypasses** — exactly what we want.

---

## Optional — require CI to pass before merge

If you want your CI to be a *required* status check (so a PR can't merge until it's
green), add this rule to the `rules` array, replacing `"my-ci-job"` with the exact
name of your check (the job/check name GitHub shows on the PR):

```json
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": false,
    "required_status_checks": [ { "context": "my-ci-job" } ]
  }
}
```

This is safe with Specfly: the PR is opened by the `Specfly[bot]` App, so your CI
**does** trigger on it and can report the required check. (A PR opened by the
built-in `GITHUB_TOKEN` would *not* trigger CI — which is precisely why Specfly uses
the App to open PRs.)

---

## Verify it works

From an up-to-date clone:

```bash
git commit --allow-empty -m "test: should be rejected"
git push origin main          # or your default branch
# expected: ! [remote rejected] main -> main (... protected by ruleset ...)
git reset --hard HEAD~1       # undo the local test commit
```

If the push is rejected, the ruleset is active.

---

## Notes & trade-offs

- **Admin escape hatch (optional).** An empty bypass list applies the rules to
  *everyone*, including repo admins — the strict, recommended posture. If you want
  an emergency override for yourself, you may add the **Repository admin** role to
  the bypass list. **Never** add `Specfly[bot]`.
- **Plan availability.** Rulesets are available on all **public** repositories for
  free; for **private** repositories, availability depends on your GitHub plan.
- **Raising the bar.** Teams can set **Required approvals** above 1, enable
  **Require review from Code Owners**, or **Require last push approval** — all
  compatible with Specfly.
