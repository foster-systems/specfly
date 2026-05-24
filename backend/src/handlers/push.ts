// `push` event handler. Delegates the trigger/result/ignore decision to the pure
// `classifyPush`, then does the D1 lookups and GitHub calls. All persisted state
// is keyed by HMAC digests recomputed from the payload — no plaintext is stored,
// and no repo/account identifier is ever logged.

import type { App } from "@octokit/app";
import {
  dispatch,
  findOpenPr,
  installationOctokit,
  openPullRequest,
  pushEmptyCommit,
  type Repo,
} from "../github";
import {
  findDispatchedRunByRepoBranchKey,
  findRunByTriggerKey,
  insertRun,
  markRunPrOpened,
} from "../db";
import { classifyPush, parseApplyArgs, parseRef } from "../logic";
import { repoBranchKey, triggerKey } from "../state";
import type { Env, PushPayload } from "../types";

export async function handlePush(
  env: Env,
  app: App,
  payload: PushPayload,
): Promise<void> {
  const parsed = parseRef(payload.ref);
  if (!parsed) return; // not a change/* branch — ignore

  const repoFullName = payload.repository.full_name;
  const branch = parsed.branch;
  const branchDigest = await repoBranchKey(
    env.STATE_HMAC_KEY,
    repoFullName,
    branch,
  );

  const dispatchedRun = await findDispatchedRunByRepoBranchKey(
    env.DB,
    branchDigest,
  );
  const classification = classifyPush(payload, dispatchedRun !== null);
  if (classification === "ignore") return;

  const installationId = payload.installation?.id;
  if (installationId == null) return; // cannot authenticate without it

  const repo: Repo = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  };

  if (classification === "trigger") {
    const tip = payload.head_commit;
    if (!tip) return;
    const triggerDigest = await triggerKey(
      env.STATE_HMAC_KEY,
      repoFullName,
      tip.id,
    );

    // Idempotency (§13): a run for this exact sha means this is a redelivery.
    if (await findRunByTriggerKey(env.DB, triggerDigest)) return;

    const args = parseApplyArgs(tip.message);
    const octokit = await installationOctokit(app, installationId);
    await dispatch(octokit, repo, {
      change: parsed.changeName,
      branch,
      head_sha: tip.id,
      model: args.model,
      effort: args.effort,
    });
    await insertRun(env.DB, {
      triggerKey: triggerDigest,
      repoBranchKey: branchDigest,
    });
    return;
  }

  // classification === "result"
  if (!dispatchedRun) return; // defensive: classifyPush already required one
  const octokit = await installationOctokit(app, installationId);
  const openPr = await findOpenPr(octokit, repo, branch);

  if (openPr === null) {
    // First apply: open the App-authored PR (fires adopter CI, approvable).
    await openPullRequest(
      octokit,
      repo,
      branch,
      parsed.changeName,
      payload.repository.default_branch,
    );
  } else {
    // Re-run: PR already open. Refresh CI with one empty App commit (§11.5),
    // never a duplicate PR.
    await pushEmptyCommit(octokit, repo, branch);
  }

  // Move the dispatched run to pr_opened so a redelivered result finds no
  // dispatched run and won't double-commit. No PR number is stored.
  await markRunPrOpened(env.DB, branchDigest);
}
