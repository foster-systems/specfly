// Ephemeral-state keying. The DB stores only HMAC digests of identifiers so it
// is non-attributable: equality is all we need (dedup a trigger, correlate a
// result), and the plaintext is always present on the live payload at lookup
// time. HMAC-SHA256 via Web Crypto — the same edge-safe primitive used for
// webhook signature verification — keyed by the server-held STATE_HMAC_KEY so
// low-entropy repo/branch names cannot be dictionary-reversed.

/** Rows whose `updated_at` ages past this many days are swept by the cron. */
export const RETENTION_DAYS = 7;

/** HMAC-SHA256(secret, value) as a lowercase hex string. */
export async function hashKey(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Dedup/PRIMARY key: digest of `"owner/repo\n<sha>"`. */
export function triggerKey(
  secret: string,
  repoFullName: string,
  sha: string,
): Promise<string> {
  return hashKey(secret, `${repoFullName}\n${sha}`);
}

/** Result-correlation key: digest of `"owner/repo\nchange/<name>"`. */
export function repoBranchKey(
  secret: string,
  repoFullName: string,
  branch: string,
): Promise<string> {
  return hashKey(secret, `${repoFullName}\n${branch}`);
}
