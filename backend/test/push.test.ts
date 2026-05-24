import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the I/O modules; keep logic.ts and state.ts real (pure). Paths resolve to
// the same src/ modules the handler imports, so these spies stand in for them.
vi.mock("../src/db", () => ({
  findDispatchedRunByRepoBranchKey: vi.fn(),
  findRunByTriggerKey: vi.fn(),
  insertRun: vi.fn(),
  markRunPrOpened: vi.fn(),
}));

vi.mock("../src/github", () => ({
  dispatch: vi.fn(),
  findOpenPr: vi.fn(),
  installationOctokit: vi.fn(),
  openPullRequest: vi.fn(),
  pushEmptyCommit: vi.fn(),
}));

import { handlePush } from "../src/handlers/push";
import {
  findDispatchedRunByRepoBranchKey,
  markRunPrOpened,
} from "../src/db";
import {
  findOpenPr,
  installationOctokit,
  openPullRequest,
  pushEmptyCommit,
} from "../src/github";
import type { Env, PushPayload, RunRow } from "../src/types";

const env = {
  STATE_HMAC_KEY: "test-state-hmac-key",
  DB: {},
} as unknown as Env;
const app = {} as unknown as Parameters<typeof handlePush>[1];

const DISPATCHED_RUN: RunRow = {
  trigger_key: "tk",
  repo_branch_key: "rbk",
  status: "dispatched",
  updated_at: "2026-05-24T00:00:00Z",
};

// A runner push (github-actions[bot], `opsx:apply` subject) to change/foo: with a
// dispatched run present, classifyPush returns "result".
function resultPush(): PushPayload {
  return {
    ref: "refs/heads/change/foo",
    repository: {
      full_name: "acme/widgets",
      default_branch: "main",
      name: "widgets",
      owner: { login: "acme" },
    },
    installation: { id: 42 },
    sender: { login: "github-actions[bot]" },
    head_commit: { id: "abc123", message: "opsx:apply foo" },
  };
}

describe("handlePush — result-path atomic claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A dispatched run exists, so the push classifies as "result".
    vi.mocked(findDispatchedRunByRepoBranchKey).mockResolvedValue(DISPATCHED_RUN);
    vi.mocked(installationOctokit).mockResolvedValue(
      {} as Awaited<ReturnType<typeof installationOctokit>>,
    );
  });

  it("no-ops when the claim reports zero rows (losing/redelivered result)", async () => {
    vi.mocked(markRunPrOpened).mockResolvedValue(0);

    await handlePush(env, app, resultPush());

    expect(markRunPrOpened).toHaveBeenCalledTimes(1);
    // Claim lost → return before any GitHub work.
    expect(installationOctokit).not.toHaveBeenCalled();
    expect(findOpenPr).not.toHaveBeenCalled();
    expect(openPullRequest).not.toHaveBeenCalled();
    expect(pushEmptyCommit).not.toHaveBeenCalled();
  });

  it("opens a PR when the claim wins and no PR is open", async () => {
    vi.mocked(markRunPrOpened).mockResolvedValue(1);
    vi.mocked(findOpenPr).mockResolvedValue(null);

    await handlePush(env, app, resultPush());

    expect(markRunPrOpened).toHaveBeenCalledTimes(1);
    expect(openPullRequest).toHaveBeenCalledTimes(1);
    expect(pushEmptyCommit).not.toHaveBeenCalled();
  });

  it("pushes exactly one CI-refresh commit when the claim wins and a PR is open", async () => {
    vi.mocked(markRunPrOpened).mockResolvedValue(1);
    vi.mocked(findOpenPr).mockResolvedValue(7);

    await handlePush(env, app, resultPush());

    expect(markRunPrOpened).toHaveBeenCalledTimes(1);
    expect(pushEmptyCommit).toHaveBeenCalledTimes(1);
    expect(openPullRequest).not.toHaveBeenCalled();
  });
});
