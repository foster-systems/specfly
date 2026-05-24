// Specfly control-plane Worker. Two endpoints:
//   GET  /         → health (no DB, no secrets)
//   POST /webhook  → GitHub App webhook receiver
// plus a daily cron (`scheduled`) that sweeps aged `runs` rows.
//
// Signature is verified on the RAW body before any JSON parsing.

import { Hono } from "hono";
import { deleteRunsOlderThan } from "./db";
import { createApp } from "./github";
import { handleInstallation } from "./handlers/installation";
import { handlePush } from "./handlers/push";
import { RETENTION_DAYS } from "./state";
import type { Env, PushPayload } from "./types";

const app = new Hono<{ Bindings: Env }>();

// 5.1 — health endpoint. Must not touch the DB or read any secret.
app.get("/", (c) => c.text("specfly backend ok"));

app.post("/webhook", async (c) => {
  // 5.2 — read the raw body and verify HMAC-SHA256 BEFORE parsing.
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  const ghApp = createApp(c.env);
  const valid =
    signature != null &&
    (await ghApp.webhooks.verify(rawBody, signature).catch(() => false));
  if (!valid) {
    return c.text("invalid signature", 401);
  }

  // 5.3 — only after a valid signature: parse and route on x-github-event.
  const event = c.req.header("x-github-event");

  if (event === "push") {
    await handlePush(c.env, ghApp, JSON.parse(rawBody) as PushPayload);
    return c.text("ok", 202);
  }
  if (event === "installation") {
    // Acknowledged so GitHub records success, but no persistence (ack-only).
    handleInstallation();
    return c.text("ok", 202);
  }

  // Any other event: acknowledge so GitHub records success, but take no action.
  return c.text("ignored", 202);
});

// Cron Trigger: TTL sweep of aged run rows. Idempotent — safe to run repeatedly.
async function scheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  await deleteRunsOlderThan(env.DB, RETENTION_DAYS);
}

export default { fetch: app.fetch, scheduled };
