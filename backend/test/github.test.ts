import { describe, expect, it } from "vitest";
import { createApp } from "../src/github";
import type { Env } from "../src/types";

// Minimal env; only PRIVATE_KEY format matters for these guard tests.
function envWith(privateKey: string): Env {
  return {
    APP_ID: "123456",
    PRIVATE_KEY: privateKey,
    WEBHOOK_SECRET: "test-webhook-secret",
    STATE_HMAC_KEY: "test-state-hmac-key",
    DB: undefined,
  } as unknown as Env;
}

describe("createApp PRIVATE_KEY format guard", () => {
  it("throws an actionable error on a PKCS#1 key (the format GitHub issues)", () => {
    const pkcs1 = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n";
    expect(() => createApp(envWith(pkcs1))).toThrowError(/PKCS#1.*PKCS#8/s);
    // The message must hand the maintainer the exact fix.
    expect(() => createApp(envWith(pkcs1))).toThrowError(/openssl pkcs8 -topk8/);
  });

  it("does not throw on a PKCS#8 key (lazy mint, so a well-formed header is enough)", () => {
    const pkcs8 = "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n";
    expect(() => createApp(envWith(pkcs8))).not.toThrow();
  });
});
