// Worker bindings + shared payload/run types. Metadata only.

export interface Env {
  DB: D1Database;
  APP_ID: string;
  PRIVATE_KEY: string;
  WEBHOOK_SECRET: string;
  STATE_HMAC_KEY: string; // keys the stored run digests (see src/state.ts)
}

// --- GitHub webhook payload subsets (only the fields we read) ---

export interface PushPayload {
  ref: string;
  repository: {
    full_name: string; // "owner/repo"
    default_branch: string;
    name: string;
    owner: { login: string };
  };
  installation?: { id: number };
  sender: { login: string };
  head_commit: { id: string; message: string } | null;
}

export interface InstallationPayload {
  action: string;
  installation: {
    id: number;
    account: { login: string; type?: string } | null;
  };
}

// --- Decision logic shapes ---

export interface ApplyArgs {
  model?: string;
  effort?: string;
}

/** client_payload sent on a `specfly-apply` repository_dispatch (≤10 keys). */
export interface DispatchPayload {
  change: string;
  branch: string; // "change/<name>"
  head_sha: string;
  model?: string;
  effort?: string;
}

export type PushClassification = "trigger" | "result" | "ignore";

// --- D1 rows ---

export type RunStatus = "dispatched" | "pr_opened";

/**
 * Slim, non-attributable run row: only HMAC-keyed digests, a status, and a
 * timestamp. No plaintext repo/account/branch/change/sha/PR is ever stored.
 */
export interface RunRow {
  trigger_key: string;
  repo_branch_key: string;
  status: RunStatus;
  updated_at: string;
}
