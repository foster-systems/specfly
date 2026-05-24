-- Specfly control-plane schema. Ephemeral, non-attributable operational state only.
-- No installations registry. The `runs` table stores only HMAC-keyed digests
-- (no plaintext repo/account/branch/change/sha/PR), a status, and a timestamp.
-- Rows are swept past a TTL by the scheduled cleanup (see src/state.ts).

CREATE TABLE IF NOT EXISTS runs (
  trigger_key      TEXT PRIMARY KEY,   -- HMAC(STATE_HMAC_KEY, "owner/repo\n<sha>")
  repo_branch_key  TEXT NOT NULL,      -- HMAC(STATE_HMAC_KEY, "owner/repo\nchange/<name>")
  status           TEXT NOT NULL,      -- 'dispatched' | 'pr_opened'
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_branch ON runs(repo_branch_key, status);
