import { describe, expect, it } from "vitest";
import app from "../src/index";
import type { Env } from "../src/types";

const SECRET = "test-webhook-secret";

// PRIVATE_KEY/APP_ID are unused by signature verification (which needs only the
// webhook secret); the App mints tokens lazily, so dummy values are fine here.
const env = {
  WEBHOOK_SECRET: SECRET,
  APP_ID: "123456",
  PRIVATE_KEY: "dummy-unused-for-signature-verification",
  STATE_HMAC_KEY: "test-state-hmac-key",
  DB: undefined,
} as unknown as Env;

// HMAC-SHA256 via Web Crypto (the same edge-safe primitive the Worker uses).
async function sign(body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "sha256=" + hex;
}

function webhookRequest(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": "push",
    "x-github-delivery": "test-delivery",
  };
  if (signature !== null) headers["x-hub-signature-256"] = signature;
  return new Request("https://api.specfly.io/webhook", {
    method: "POST",
    headers,
    body,
  });
}

// A push to a non-change branch classifies as `ignore`, so the handler returns
// before any DB/GitHub access — isolating signature handling in the assertion.
const IGNORED_PUSH = JSON.stringify({
  ref: "refs/heads/main",
  repository: {
    full_name: "acme/widgets",
    default_branch: "main",
    name: "widgets",
    owner: { login: "acme" },
  },
  installation: { id: 42 },
  sender: { login: "alice" },
  head_commit: { id: "abc123", message: "chore: docs" },
});

describe("POST /webhook signature verification", () => {
  it("accepts a valid sha256 HMAC and routes the event", async () => {
    const sig = await sign(IGNORED_PUSH);
    const res = await app.fetch(webhookRequest(IGNORED_PUSH, sig), env);
    expect(res.status).toBe(202);
  });

  it("rejects a tampered body whose signature no longer matches", async () => {
    const sig = await sign(IGNORED_PUSH);
    const tampered = IGNORED_PUSH.replace("acme/widgets", "evil/widgets");
    const res = await app.fetch(webhookRequest(tampered, sig), env);
    expect(res.status).toBe(401);
  });

  it("rejects a flipped-byte signature", async () => {
    const sig = await sign(IGNORED_PUSH);
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    const res = await app.fetch(webhookRequest(IGNORED_PUSH, flipped), env);
    expect(res.status).toBe(401);
  });

  it("rejects a missing signature", async () => {
    const res = await app.fetch(webhookRequest(IGNORED_PUSH, null), env);
    expect(res.status).toBe(401);
  });

  it("does not parse a hostile body when the signature is invalid", async () => {
    const res = await app.fetch(
      webhookRequest("{ not valid json", "sha256=deadbeef"),
      env,
    );
    expect(res.status).toBe(401);
  });
});
