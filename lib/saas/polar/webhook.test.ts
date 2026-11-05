import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signPolarPayload, TOLERANCE_SECONDS, verifyPolarWebhook } from "./webhook";

/** A fake secret built at runtime and low in entropy, so secret scanners never see a real-looking literal. */
const fakeSecret = (prefix: string, fill: string) => `${prefix}_${fill.repeat(12)}`;

// A signature made the way Polar's SDK makes it was also checked once against
// the real `standardwebhooks` library (T40 hand-off); these pin the same facts.

const SECRET = fakeSecret("whsec", "w");
const NOW = 1_762_300_000_000;
const TS = Math.floor(NOW / 1000);
const BODY = '{"type":"order.paid","data":{"id":"o1"}}';

function headers(over: Partial<Record<string, string>> = {}) {
  return new Headers({
    "webhook-id": "msg_1",
    "webhook-timestamp": String(TS),
    "webhook-signature": `v1,${signPolarPayload(SECRET, "msg_1", TS, BODY)}`,
    ...over,
  });
}

describe("verifyPolarWebhook", () => {
  it("accepts a good signature and returns the parsed event", () => {
    const result = verifyPolarWebhook({ body: BODY, headers: headers(), secret: SECRET, nowMs: NOW });
    expect(result).toEqual({ ok: true, id: "msg_1", event: { type: "order.paid", data: { id: "o1" } } });
  });

  it("keys the HMAC with the secret's UTF-8 bytes, prefix included, never base64-decoded", () => {
    const decodedKey = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
    const wrong = createHmac("sha256", decodedKey).update(`msg_1.${TS}.${BODY}`).digest("base64");
    const result = verifyPolarWebhook({ body: BODY, headers: headers({ "webhook-signature": `v1,${wrong}` }), secret: SECRET, nowMs: NOW });
    expect(result).toEqual({ ok: false, reason: "signature" });
  });

  it("finds a valid entry among several (key rotation)", () => {
    const good = signPolarPayload(SECRET, "msg_1", TS, BODY);
    const sig = `v1,${signPolarPayload(fakeSecret("whsec", "o"), "msg_1", TS, BODY)} v1a,xyz v1,${good}`;
    expect(verifyPolarWebhook({ body: BODY, headers: headers({ "webhook-signature": sig }), secret: SECRET, nowMs: NOW }).ok).toBe(true);
  });

  it("refuses a changed body, id or timestamp", () => {
    expect(verifyPolarWebhook({ body: BODY.replace("o1", "o2"), headers: headers(), secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: "signature" });
    expect(verifyPolarWebhook({ body: BODY, headers: headers({ "webhook-id": "msg_2" }), secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: "signature" });
    expect(verifyPolarWebhook({ body: BODY, headers: headers({ "webhook-timestamp": String(TS + 1) }), secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: "signature" });
  });

  it("refuses a stale or future timestamp beyond 5 minutes", () => {
    const early = NOW - (TOLERANCE_SECONDS + 1) * 1000;
    const late = NOW + (TOLERANCE_SECONDS + 1) * 1000;
    expect(verifyPolarWebhook({ body: BODY, headers: headers(), secret: SECRET, nowMs: early })).toEqual({ ok: false, reason: "timestamp" });
    expect(verifyPolarWebhook({ body: BODY, headers: headers(), secret: SECRET, nowMs: late })).toEqual({ ok: false, reason: "timestamp" });
    expect(verifyPolarWebhook({ body: BODY, headers: headers(), secret: SECRET, nowMs: NOW + TOLERANCE_SECONDS * 1000 }).ok).toBe(true);
  });

  it("refuses missing or malformed headers and a wrong secret", () => {
    const h = headers();
    h.delete("webhook-id");
    expect(verifyPolarWebhook({ body: BODY, headers: h, secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: "headers" });
    expect(verifyPolarWebhook({ body: BODY, headers: headers({ "webhook-timestamp": "12.5" }), secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: "headers" });
    expect(verifyPolarWebhook({ body: BODY, headers: headers(), secret: "other", nowMs: NOW })).toEqual({ ok: false, reason: "signature" });
  });

  it("reports a signed body that is not JSON", () => {
    const body = "not json";
    const sig = `v1,${signPolarPayload(SECRET, "msg_1", TS, body)}`;
    expect(verifyPolarWebhook({ body, headers: headers({ "webhook-signature": sig }), secret: SECRET, nowMs: NOW })).toEqual({ ok: false, reason: "json" });
  });
});
