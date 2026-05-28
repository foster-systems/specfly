// GitHub App integration: App init, per-request installation-token minting, and
// the four GitHub API calls the handlers need. Tokens are minted lazily by
// `getInstallationOctokit` on first request and never persisted.

import { App } from "@octokit/app";
import type { DispatchPayload, Env } from "./types";

export interface Repo {
  owner: string;
  repo: string;
}

/** The Octokit type `app.getInstallationOctokit` resolves to. */
export type InstallationOctokit = Awaited<
  ReturnType<App["getInstallationOctokit"]>
>;

// GitHub issues App private keys in PKCS#1 ("-----BEGIN RSA PRIVATE KEY-----"),
// but @octokit/app's JWT layer (universal-github-app-jwt) only accepts PKCS#8
// ("-----BEGIN PRIVATE KEY-----"). A PKCS#1 key passes construction and webhook
// signature verification, then throws deep in token minting on the FIRST real
// trigger — the webhook still returns 2xx, so no dispatch fires and the only clue
// is a cryptic library message in `wrangler tail`. Fail fast at App init with the
// exact remedy instead. (Health checks don't hit this path; createApp runs only
// inside POST /webhook.)
function assertPkcs8PrivateKey(privateKey: string): void {
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(privateKey)) {
    throw new Error(
      'PRIVATE_KEY is in PKCS#1 format ("BEGIN RSA PRIVATE KEY"), but token minting ' +
        'requires PKCS#8 ("BEGIN PRIVATE KEY"). Convert it and re-set the secret:\n' +
        "  openssl pkcs8 -topk8 -nocrypt -in <github-app-key>.pem -out k8.pem\n" +
        "  wrangler secret put PRIVATE_KEY < k8.pem",
    );
  }
}

export function createApp(env: Env): App {
  assertPkcs8PrivateKey(env.PRIVATE_KEY);
  return new App({
    appId: env.APP_ID,
    privateKey: env.PRIVATE_KEY,
    webhooks: { secret: env.WEBHOOK_SECRET },
  });
}

/** Mint a short-lived installation-scoped client. Never stored. */
export function installationOctokit(
  app: App,
  installationId: number,
): Promise<InstallationOctokit> {
  return app.getInstallationOctokit(installationId);
}

/** Fire the `specfly-apply` repository_dispatch (≤10 client_payload keys). */
export async function dispatch(
  octokit: InstallationOctokit,
  repo: Repo,
  payload: DispatchPayload,
): Promise<void> {
  const client_payload: Record<string, string> = {
    change: payload.change,
    branch: payload.branch,
    head_sha: payload.head_sha,
  };
  if (payload.model) client_payload.model = payload.model;
  if (payload.effort) client_payload.effort = payload.effort;

  await octokit.request("POST /repos/{owner}/{repo}/dispatches", {
    owner: repo.owner,
    repo: repo.repo,
    event_type: "specfly-apply",
    client_payload,
  });
}

/** Number of an open PR whose head is `branch`, or null if none is open. */
export async function findOpenPr(
  octokit: InstallationOctokit,
  repo: Repo,
  branch: string,
): Promise<number | null> {
  const res = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner: repo.owner,
    repo: repo.repo,
    state: "open",
    head: `${repo.owner}:${branch}`,
  });
  return res.data.length > 0 ? res.data[0].number : null;
}

/** Open an App-authored PR (separate actor → approvable + fires adopter CI). */
export async function openPullRequest(
  octokit: InstallationOctokit,
  repo: Repo,
  branch: string,
  changeName: string,
  baseBranch: string,
): Promise<number> {
  const res = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner: repo.owner,
    repo: repo.repo,
    title: `Apply ${changeName}`,
    head: branch,
    base: baseBranch,
    draft: false,
    body: "Applied by Specfly via `/opsx:apply`. Review, approve, merge.",
  });
  return res.data.number;
}

/**
 * Push one empty same-tree commit as the App to re-fire the adopter's CI on a
 * re-run (§11.5). Fast-forward only (no force). The `chore: re-run CI` subject
 * never starts with `/sfx:apply`, and it lands as `specfly[bot]`, so its push
 * webhook classifies as `ignore` and cannot loop.
 */
export async function pushEmptyCommit(
  octokit: InstallationOctokit,
  repo: Repo,
  branch: string,
): Promise<void> {
  const ref = `heads/${branch}`;

  const refRes = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/{ref}",
    { owner: repo.owner, repo: repo.repo, ref },
  );
  const headSha = refRes.data.object.sha;

  const commitRes = await octokit.request(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    { owner: repo.owner, repo: repo.repo, commit_sha: headSha },
  );
  const treeSha = commitRes.data.tree.sha;

  const newCommit = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner: repo.owner,
      repo: repo.repo,
      message: "chore: re-run CI",
      tree: treeSha,
      parents: [headSha],
    },
  );

  await octokit.request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner: repo.owner,
    repo: repo.repo,
    ref,
    sha: newCommit.data.sha,
    force: false,
  });
}
