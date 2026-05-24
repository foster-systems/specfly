// D1 query helpers. No business logic — just reads/writes. All run state is
// keyed by HMAC digests (see src/state.ts); no plaintext identifiers are stored.

import type { RunRow } from "./types";

/** Idempotency lookup: a run already exists for this exact trigger digest. */
export async function findRunByTriggerKey(
  db: D1Database,
  triggerKey: string,
): Promise<RunRow | null> {
  return db
    .prepare(`SELECT * FROM runs WHERE trigger_key = ?1 LIMIT 1`)
    .bind(triggerKey)
    .first<RunRow>();
}

/** Most recent still-dispatched run for a branch digest (drives result detection). */
export async function findDispatchedRunByRepoBranchKey(
  db: D1Database,
  repoBranchKey: string,
): Promise<RunRow | null> {
  return db
    .prepare(
      `SELECT * FROM runs
       WHERE repo_branch_key = ?1 AND status = 'dispatched'
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .bind(repoBranchKey)
    .first<RunRow>();
}

export async function insertRun(
  db: D1Database,
  row: { triggerKey: string; repoBranchKey: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO runs (trigger_key, repo_branch_key, status)
       VALUES (?1, ?2, 'dispatched')`,
    )
    .bind(row.triggerKey, row.repoBranchKey)
    .run();
}

/**
 * Atomically claim a branch's dispatched run by transitioning it to pr_opened,
 * returning the number of rows changed. This single UPDATE is the atomic claim
 * that closes the result-path read→act→update race: D1 serializes concurrent
 * writers, so of two near-simultaneous results only one sees `changes >= 1` and
 * acts; the loser sees `0` and no-ops (see handlers/push.ts).
 */
export async function markRunPrOpened(
  db: D1Database,
  repoBranchKey: string,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE runs SET status = 'pr_opened', updated_at = datetime('now')
       WHERE repo_branch_key = ?1 AND status = 'dispatched'`,
    )
    .bind(repoBranchKey)
    .run();
  return result.meta.changes;
}

/** TTL sweep: delete run rows whose updated_at is older than `days` days ago. */
export async function deleteRunsOlderThan(
  db: D1Database,
  days: number,
): Promise<void> {
  await db
    .prepare(`DELETE FROM runs WHERE updated_at < datetime('now', ?1)`)
    .bind(`-${days} days`)
    .run();
}
