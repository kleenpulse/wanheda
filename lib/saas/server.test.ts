import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb, type FakeQuery } from "@/lib/db/fake";
import type { PolarClient } from "./polar/client";
import { PolarError } from "./polar/client";

vi.mock("server-only", () => ({}));
let fake: FakeDb | null = null;
vi.mock("@/lib/db", () => ({ getDb: () => fake?.db ?? null }));

const { seal, unseal } = await import("./seal");
const { syncConnector } = await import("./server");
const { patchConnectorSecret } = await import("./store");

/** The value, or a failed test. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const KEY = randomBytes(32);
const ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const OWNER = "owner-1";

const SUB = { id: "sub_1", created_at: "2026-10-01T00:00:00Z", modified_at: "2026-10-05T00:00:00Z", status: "active", amount: 900, currency: "usd", recurring_interval: "month", recurring_interval_count: 1, customer_id: "cus_1", product_id: "p1" };
const ORDER = { id: "ord_1", created_at: "2026-10-01T00:00:01Z", modified_at: null, status: "paid", currency: "usd", customer_id: "cus_1", product_id: "p1", subscription_id: "sub_1" };

/** A db with the connector row and billing_event's unique key, the way Postgres keeps it. */
function db(secret = { token: "polar_oat_abcdefgh1234", webhookSecret: "whsec_one" as string | null }) {
  const billing = new Set<string>();
  let sealed = seal(JSON.stringify(secret), ID, KEY);
  const f = fakeDb((q: FakeQuery) => {
    if (q.op === "select" && q.table === "connector") return [{ id: ID, userId: OWNER, sealedSecret: sealed, config: { server: "sandbox", productMap: {} } }];
    if (q.op === "select" && q.table === "billing_event") return [];
    if (q.op === "insert" && q.table === "billing_event") {
      return (q.values as { eventId: string }[]).flatMap((v) => (billing.has(v.eventId) ? [] : (billing.add(v.eventId), [{ id: v.eventId }])));
    }
    if (q.op === "update" && q.table === "connector") {
      const set = q.set as { sealedSecret?: string };
      if (set.sealedSecret) sealed = set.sealedSecret;
      return [];
    }
    throw new Error(`unexpected ${q.op} ${q.table}`);
  });
  return Object.assign(f, { sealed: () => sealed, billing });
}

function client(over: Partial<Record<string, unknown[]>> = {}): PolarClient {
  const lists: Record<string, unknown[]> = { "/v1/subscriptions/": [SUB], "/v1/orders/": [ORDER, { junk: true }], "/v1/refunds/": [], ...over };
  return {
    listAll: (path) => Promise.resolve(lists[path] ?? []),
    products: () => Promise.resolve([{ id: "p1", name: "Pro", is_recurring: true, is_archived: false, organization_id: "org_1" }]),
  };
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@db.invalid/x";
  process.env.CONNECTOR_SEAL_KEY = KEY.toString("base64");
});
afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.CONNECTOR_SEAL_KEY;
  fake = null;
});

describe("syncConnector", () => {
  it("appends new snapshots once: a second pull of the same state adds nothing (V34)", async () => {
    const d = db();
    fake = d;
    const first = await syncConnector(OWNER, ID, () => client());
    expect(first).toEqual({ ok: true, added: 2, skipped: 1, products: [{ id: "p1", name: "Pro", recurring: true, archived: false }] });
    const second = await syncConnector(OWNER, ID, () => client());
    expect(second).toMatchObject({ ok: true, added: 0 });
    // A changed subscription is a new snapshot, so it lands.
    const third = await syncConnector(OWNER, ID, () => client({ "/v1/subscriptions/": [{ ...SUB, status: "canceled", modified_at: "2026-10-20T00:00:00Z" }] }));
    expect(third).toMatchObject({ ok: true, added: 1 });
    expect([...d.billing].sort()).toEqual([
      "sync:order:ord_1:2026-10-01T00:00:01.000Z",
      "sync:subscription:sub_1:2026-10-05T00:00:00.000Z",
      "sync:subscription:sub_1:2026-10-20T00:00:00.000Z",
    ]);
  });

  it("records Polar's refusal on the connector without the token in it", async () => {
    fake = db();
    const failing: PolarClient = { listAll: () => Promise.reject(new PolarError("unauthorized", 401, "x")), products: () => Promise.reject(new PolarError("unauthorized", 401, "x")) };
    const result = await syncConnector(OWNER, ID, () => failing);
    expect(result).toEqual({ ok: false, reason: "polar", error: "Polar refused the token. It may be revoked or expired." });
    const update = fake.queries.find((q) => q.op === "update");
    expect(JSON.stringify(update?.set)).not.toContain("polar_oat");
  });

  it("is off without a seal key", async () => {
    fake = db();
    delete process.env.CONNECTOR_SEAL_KEY;
    expect(await syncConnector(OWNER, ID, () => client())).toEqual({ ok: false, reason: "off" });
  });
});

describe("patchConnectorSecret", () => {
  it("replacing one half keeps the other, still sealed to this row", async () => {
    const d = db();
    fake = d;
    expect(await patchConnectorSecret(OWNER, ID, { webhookSecret: "whsec_two" }, KEY)).toBe("saved");
    expect(JSON.parse(must(unseal(d.sealed(), ID, KEY)))).toEqual({ token: "polar_oat_abcdefgh1234", webhookSecret: "whsec_two" });
    expect(await patchConnectorSecret(OWNER, ID, { token: "polar_oat_new_token_99" }, KEY)).toBe("saved");
    expect(JSON.parse(must(unseal(d.sealed(), ID, KEY)))).toEqual({ token: "polar_oat_new_token_99", webhookSecret: "whsec_two" });
  });

  it("a blob that won't open takes a new token but not a lone webhook secret", async () => {
    const d = db();
    fake = d;
    const otherKey = randomBytes(32);
    expect(await patchConnectorSecret(OWNER, ID, { webhookSecret: "whsec_two" }, otherKey)).toBe("broken");
    expect(await patchConnectorSecret(OWNER, ID, { token: "polar_oat_fresh_token" }, otherKey)).toBe("saved");
    expect(JSON.parse(must(unseal(d.sealed(), ID, otherKey)))).toEqual({ token: "polar_oat_fresh_token", webhookSecret: null });
  });
});
