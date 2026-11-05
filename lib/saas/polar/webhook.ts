import { createHmac, timingSafeEqual } from "node:crypto";

// Polar signs webhooks with Standard Webhooks (SPEC V34): HMAC-SHA256 over
// `<webhook-id>.<webhook-timestamp>.<raw body>`, base64, sent as one or more
// space-separated `v1,<sig>` entries in `webhook-signature`.
//
// The key is the secret's own UTF-8 bytes. Polar's SDK base64-encodes the
// secret string as-is before handing it to `standardwebhooks`, which decodes it
// again, so a `whsec_` prefix is part of the key and is never stripped or
// base64-decoded here. Doing either would reject every real delivery.

export const TOLERANCE_SECONDS = 5 * 60;

export interface HeaderBag {
  get(name: string): string | null;
}

export type VerifyResult =
  | { ok: true; id: string; event: unknown }
  | { ok: false; reason: "headers" | "timestamp" | "signature" | "json" };

export function signPolarPayload(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${timestamp}.${body}`).digest("base64");
}

/** Checks the signature on the raw body text before anything parses it. `nowMs` is injectable for tests. */
export function verifyPolarWebhook(input: { body: string; headers: HeaderBag; secret: string; nowMs?: number }): VerifyResult {
  const id = input.headers.get("webhook-id");
  const timestampRaw = input.headers.get("webhook-timestamp");
  const signatures = input.headers.get("webhook-signature");
  if (!id || !timestampRaw || !signatures || !/^\d{1,12}$/.test(timestampRaw)) return { ok: false, reason: "headers" };

  const timestamp = Number(timestampRaw);
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp" };

  const expected = Buffer.from(signPolarPayload(input.secret, id, timestamp, input.body), "base64");
  const matched = signatures.split(" ").some((entry) => {
    const [version, sig] = entry.split(",", 2);
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) return { ok: false, reason: "signature" };

  try {
    return { ok: true, id, event: JSON.parse(input.body) as unknown };
  } catch {
    return { ok: false, reason: "json" };
  }
}
