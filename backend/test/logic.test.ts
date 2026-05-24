import { describe, expect, it } from "vitest";
import {
  classifyPush,
  isTriggerCommit,
  parseApplyArgs,
  parseRef,
} from "../src/logic";
import type { PushPayload } from "../src/types";

describe("parseRef", () => {
  it("parses a change/<name> ref", () => {
    expect(parseRef("refs/heads/change/foo")).toEqual({
      branch: "change/foo",
      changeName: "foo",
    });
  });

  it("keeps nested change names intact", () => {
    expect(parseRef("refs/heads/change/foo/bar")).toEqual({
      branch: "change/foo/bar",
      changeName: "foo/bar",
    });
  });

  it("returns null for non-change branches", () => {
    expect(parseRef("refs/heads/main")).toBeNull();
    expect(parseRef("refs/heads/changelog")).toBeNull();
  });

  it("returns null for an empty change name", () => {
    expect(parseRef("refs/heads/change/")).toBeNull();
  });

  it("returns null for tags", () => {
    expect(parseRef("refs/tags/change/foo")).toBeNull();
  });
});

describe("isTriggerCommit", () => {
  it("matches the marker at the start", () => {
    expect(isTriggerCommit("@specfly:apply")).toBe(true);
    expect(isTriggerCommit("@specfly:apply model=opus")).toBe(true);
  });

  it("trims leading whitespace", () => {
    expect(isTriggerCommit("   @specfly:apply")).toBe(true);
  });

  it("only considers the first line", () => {
    expect(isTriggerCommit("@specfly:apply\nbody text")).toBe(true);
    expect(isTriggerCommit("fix something\n@specfly:apply")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isTriggerCommit("@SPECFLY:APPLY")).toBe(false);
  });

  it("rejects the runner's result subject", () => {
    expect(isTriggerCommit("opsx:apply foo")).toBe(false);
    expect(isTriggerCommit("chore: re-run CI")).toBe(false);
  });
});

describe("parseApplyArgs", () => {
  it("parses known keys and ignores unknown", () => {
    expect(parseApplyArgs("@specfly:apply model=opus effort=high foo=bar")).toEqual(
      { model: "opus", effort: "high" },
    );
  });

  it("yields empty options when no args are present", () => {
    expect(parseApplyArgs("@specfly:apply")).toEqual({});
  });

  it("parses a single key", () => {
    expect(parseApplyArgs("@specfly:apply effort=low")).toEqual({ effort: "low" });
  });

  it("ignores empty values", () => {
    expect(parseApplyArgs("@specfly:apply model=")).toEqual({});
  });
});

function pushPayload(over: {
  ref?: string;
  sender?: string;
  subject?: string | null;
}): PushPayload {
  const subject = over.subject;
  return {
    ref: over.ref ?? "refs/heads/change/foo",
    repository: {
      full_name: "acme/widgets",
      default_branch: "main",
      name: "widgets",
      owner: { login: "acme" },
    },
    installation: { id: 42 },
    sender: { login: over.sender ?? "alice" },
    head_commit:
      subject === null ? null : { id: "abc123", message: subject ?? "@specfly:apply" },
  };
}

describe("classifyPush", () => {
  it("classifies a human @specfly:apply push as trigger", () => {
    const p = pushPayload({ sender: "alice", subject: "@specfly:apply" });
    expect(classifyPush(p, false)).toBe("trigger");
  });

  it("is a trigger regardless of an existing dispatched run (idempotency is in the handler)", () => {
    const p = pushPayload({ sender: "alice", subject: "@specfly:apply model=opus" });
    expect(classifyPush(p, true)).toBe("trigger");
  });

  it("classifies a runner push with a dispatched run as result", () => {
    const p = pushPayload({ sender: "github-actions[bot]", subject: "opsx:apply foo" });
    expect(classifyPush(p, true)).toBe("result");
  });

  it("ignores a runner push with no dispatched run", () => {
    const p = pushPayload({ sender: "github-actions[bot]", subject: "opsx:apply foo" });
    expect(classifyPush(p, false)).toBe("ignore");
  });

  it("ignores the App's own CI-refresh push (specfly[bot])", () => {
    const p = pushPayload({ sender: "specfly[bot]", subject: "chore: re-run CI" });
    expect(classifyPush(p, true)).toBe("ignore");
  });

  it("ignores a human non-marker push during a dispatched run", () => {
    const p = pushPayload({ sender: "alice", subject: "wip: tinkering" });
    expect(classifyPush(p, true)).toBe("ignore");
  });

  it("ignores pushes to non-change branches", () => {
    const p = pushPayload({ ref: "refs/heads/main", subject: "@specfly:apply" });
    expect(classifyPush(p, false)).toBe("ignore");
  });

  it("ignores a branch-deletion push (no head_commit)", () => {
    const p = pushPayload({ sender: "alice", subject: null });
    expect(classifyPush(p, false)).toBe("ignore");
  });
});
