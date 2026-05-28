// Pure decision core — NO I/O. The trigger/result/ignore rules live here so they
// are unit-testable without GitHub or D1. Handlers do the lookups and API calls
// and delegate every decision to these functions.

import type { ApplyArgs, PushClassification, PushPayload } from "./types";

const REF_PREFIX = "refs/heads/change/";
const NAMESPACE = "/sfx:";
const APPLY_COMMAND = "apply";
const RUNNER = "github-actions[bot]";

/** First line of a commit message (everything before the first newline). */
export function firstLineOf(message: string): string {
  const nl = message.indexOf("\n");
  return nl === -1 ? message : message.slice(0, nl);
}

/** `refs/heads/change/<name>` → `{ branch, changeName }`; anything else → null. */
export function parseRef(
  ref: string,
): { branch: string; changeName: string } | null {
  if (!ref.startsWith(REF_PREFIX)) return null;
  const changeName = ref.slice(REF_PREFIX.length);
  if (changeName.length === 0) return null;
  return { branch: `change/${changeName}`, changeName };
}

/** Extract the `/sfx:<command>` verb from the (first) line: trims leading
 *  whitespace, requires the `/sfx:` namespace, and returns the first
 *  whitespace-delimited token immediately after it — or null when the line is not
 *  a `/sfx:` command or no verb follows (bare `/sfx:`, `/sfx: apply`).
 *  Matching is case-sensitive. */
export function parseSfxCommand(line: string): string | null {
  const head = firstLineOf(line).replace(/^\s+/, "");
  if (!head.startsWith(NAMESPACE)) return null;
  const verb = head.slice(NAMESPACE.length).split(/\s+/, 1)[0];
  return verb.length > 0 ? verb : null;
}

/** True iff the (first) line is a `/sfx:apply` command — the `/sfx:` namespace
 *  immediately followed by the `apply` verb as a whole token (case-sensitive). */
export function isTriggerCommit(line: string): boolean {
  return parseSfxCommand(line) === APPLY_COMMAND;
}

/** Parse `key=value` tokens after the `/sfx:<command>` prefix. Recognizes
 *  `model`/`effort`; ignores unknown keys and empty values. Absence is valid
 *  (returns `{}`). */
export function parseApplyArgs(line: string): ApplyArgs {
  const head = firstLineOf(line).replace(/^\s+/, "");
  let rest = head;
  if (head.startsWith(NAMESPACE)) {
    const afterNs = head.slice(NAMESPACE.length);
    const verb = afterNs.split(/\s+/, 1)[0];
    rest = afterNs.slice(verb.length);
  }
  const args: ApplyArgs = {};
  for (const token of rest.trim().split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1);
    if (value.length === 0) continue;
    if (key === "model") args.model = value;
    else if (key === "effort") args.effort = value;
  }
  return args;
}

/**
 * Classify an inbound push using only the payload plus whether a `dispatched`
 * run already exists for the branch:
 *  - human + `/sfx:apply` tip on `change/*`      → "trigger"
 *  - `github-actions[bot]` + a dispatched run        → "result"
 *  - `specfly[bot]` CI-refresh / anything else        → "ignore"
 *
 * The per-sha trigger idempotency check is I/O and lives in the handler.
 */
export function classifyPush(
  payload: PushPayload,
  hasDispatchedRun: boolean,
): PushClassification {
  if (!parseRef(payload.ref)) return "ignore";

  const sender = payload.sender?.login;
  const tip = payload.head_commit;

  // Trigger: a human (never the runner) pushed a /sfx:apply tip commit.
  if (sender !== RUNNER && tip && isTriggerCommit(tip.message)) {
    return "trigger";
  }

  // Result: the runner's GITHUB_TOKEN push landed while a dispatch is open.
  if (sender === RUNNER && hasDispatchedRun) {
    return "result";
  }

  // specfly[bot] CI-refresh, non-marker human pushes, etc. cannot loop.
  return "ignore";
}
