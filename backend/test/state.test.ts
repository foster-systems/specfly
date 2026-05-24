import { describe, expect, it } from "vitest";
import { hashKey, repoBranchKey, triggerKey } from "../src/state";

const SECRET = "state-secret";
const OTHER = "different-secret";
const HEX64 = /^[0-9a-f]{64}$/; // HMAC-SHA256 → 32 bytes → 64 lowercase hex chars

describe("hashKey", () => {
  it("is deterministic for the same secret and value", async () => {
    const a = await hashKey(SECRET, "owner/repo\nabc123");
    const b = await hashKey(SECRET, "owner/repo\nabc123");
    expect(a).toBe(b);
  });

  it("is key-sensitive: a different secret yields a different digest", async () => {
    const a = await hashKey(SECRET, "owner/repo\nabc123");
    const b = await hashKey(OTHER, "owner/repo\nabc123");
    expect(a).not.toBe(b);
  });

  it("outputs only lowercase hex and never leaks the plaintext", async () => {
    const digest = await hashKey(SECRET, "owner/repo\nbranch");
    expect(digest).toMatch(HEX64);
    expect(digest).not.toContain("owner");
    expect(digest).not.toContain("repo");
    expect(digest).not.toContain("branch");
  });

  it("is value-sensitive: different values yield different digests", async () => {
    const a = await hashKey(SECRET, "a");
    const b = await hashKey(SECRET, "b");
    expect(a).not.toBe(b);
  });
});

describe("triggerKey / repoBranchKey", () => {
  it("are hex digests", async () => {
    expect(await triggerKey(SECRET, "acme/widgets", "deadbeef")).toMatch(HEX64);
    expect(await repoBranchKey(SECRET, "acme/widgets", "change/foo")).toMatch(
      HEX64,
    );
  });

  it("are distinct for the same repo (different keyed inputs)", async () => {
    const repo = "acme/widgets";
    const tk = await triggerKey(SECRET, repo, "deadbeef");
    const rbk = await repoBranchKey(SECRET, repo, "change/foo");
    expect(tk).not.toBe(rbk);
  });

  it("match the documented input shape (joined with a newline)", async () => {
    const repo = "acme/widgets";
    expect(await triggerKey(SECRET, repo, "deadbeef")).toBe(
      await hashKey(SECRET, "acme/widgets\ndeadbeef"),
    );
    expect(await repoBranchKey(SECRET, repo, "change/foo")).toBe(
      await hashKey(SECRET, "acme/widgets\nchange/foo"),
    );
  });

  it("are key-sensitive (rotation invalidates digests)", async () => {
    const repo = "acme/widgets";
    expect(await triggerKey(SECRET, repo, "deadbeef")).not.toBe(
      await triggerKey(OTHER, repo, "deadbeef"),
    );
  });
});
