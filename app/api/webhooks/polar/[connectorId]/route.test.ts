import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb, type FakeQuery } from "@/lib/db/fake";

// T44 exit case, end to end through the real route, store and seal: the same
// delivery 3× stores one billing_event and schedules one reconcile. The fake
// db enforces the two unique keys the way Postgres does (on conflict do nothing).

vi.mock("server-only", () => ({}));
let fake: FakeDb | null = null;
vi.mock("@/lib/db", () => ({ getDb: () => fake?.db ?? null }));
const afterCalls: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => afterCalls.push(fn),
}));

const { seal } = await import("@/lib/saas/seal");
const { signPolarPayload } = await import("@/lib/saas/polar/webhook");
const { POST } = await import("./route");

/** The value, or a failed test. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const KEY = randomBytes(32);
const CONNECTOR = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SECRET = "whsec_test_secret_value";

const SUB = {
  id: "sub_1",
  created_at: "2026-11-01T10:00:00Z",
  modified_at: "2026-11-01T10:00:00Z",
  status: "active",
  amount: 1500,
  currency: "usd",
  recurring_interval: "month",
  recurring_interval_count: 1,
  customer_id: "cus_1",
  product_id: "prod_1",
};

function db(secret: { token: string; webhookSecret: string | null } = { token: "polar_oat_xxxxxxxx", webhookSecret: SECRET }) {
  const processed = new Set<string>();
  const billing = new Set<string>();
  const sealed = seal(JSON.stringify(secret), CONNECTOR, KEY);
  return fakeDb((q: FakeQuery) => {
    if (q.op === "select" && q.table === "connector") {
      return [{ id: CONNECTOR, userId: "owner-1", sealedSecret: sealed, config: { server: "sandbox" } }];
    }
    if (q.op === "insert") {
      const v = q.values as { connectorId: string; eventId: string };
      const set = q.table === "processed_event" ? processed : billing;
      const k = `${v.connectorId}:${v.eventId}`;
      if (set.has(k)) return [];
      set.add(k);
      return [{ id: k }];
    }
    if (q.op === "update" && q.table === "connector") return [];
    throw new Error(`unexpected ${q.op} ${q.table}`);
  });
}

function delivery(id: string, body: string, opts: { secret?: string; ts?: number } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return new Request(`http://local/api/webhooks/polar/${CONNECTOR}`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": `v1,${signPolarPayload(opts.secret ?? SECRET, id, ts, body)}`,
    },
  });
}

const ctx = (connectorId = CONNECTOR) => ({ params: Promise.resolve({ connectorId }) });
const inserts = (table: string) => must(fake).queries.filter((q) => q.op === "insert" && q.table === table);

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@db.invalid/x";
  process.env.CONNECTOR_SEAL_KEY = KEY.toString("base64");
  afterCalls.length = 0;
});
afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.CONNECTOR_SEAL_KEY;
  fake = null;
});

describe("POST /api/webhooks/polar/[connectorId]", () => {
  it("same delivery 3× ⇒ one stored event, one reconcile, 200 each time", async () => {
    fake = db();
    const body = JSON.stringify({ type: "subscription.created", data: SUB });
    const answers = [];
    for (let i = 0; i < 3; i++) {
      const res = await POST(delivery("msg_1", body), ctx());
      answers.push([res.status, await res.json()]);
    }
    expect(answers).toEqual([
      [200, { ok: true, duplicate: false }],
      [200, { ok: true, duplicate: true }],
      [200, { ok: true, duplicate: true }],
    ]);
    // Every attempt writes both rows in one batch (one transaction) …
    expect(fake.batches).toBe(3);
    expect(inserts("billing_event")).toHaveLength(3);
    // … and both carry the delivery id, so the unique keys turn repeats into nothing.
    expect(inserts("billing_event").map((q) => (q.values as { eventId: string }).eventId)).toEqual(["msg_1", "msg_1", "msg_1"]);
    expect(afterCalls).toHaveLength(1);
  });

  it("refuses a bad signature before touching a row", async () => {
    fake = db();
    const res = await POST(delivery("msg_1", JSON.stringify({ type: "subscription.created", data: SUB }), { secret: "whsec_wrong_secret" }), ctx());
    expect(res.status).toBe(401);
    expect(fake.queries.filter((q) => q.op !== "select")).toEqual([]);
  });

  it("refuses a replay older than 5 minutes", async () => {
    fake = db();
    const res = await POST(delivery("msg_1", "{}", { ts: Math.floor(Date.now() / 1000) - 600 }), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "timestamp" });
  });

  it("records an event type we don't keep without storing it", async () => {
    fake = db();
    const res = await POST(delivery("msg_9", JSON.stringify({ type: "checkout.created", data: {} })), ctx());
    expect(res.status).toBe(200);
    expect(inserts("processed_event")).toHaveLength(1);
    expect(inserts("billing_event")).toHaveLength(0);
    expect(afterCalls).toHaveLength(0);
  });

  it("marks a signed event it can't read as processed and says so on the connector", async () => {
    fake = db();
    const body = JSON.stringify({ type: "subscription.updated", data: { id: "sub_1" } });
    const res = await POST(delivery("msg_7", body), ctx());
    expect(res.status).toBe(200);
    expect(inserts("billing_event")).toHaveLength(0);
    const update = fake.queries.find((q) => q.op === "update" && q.table === "connector");
    expect((update?.set as { lastError?: string } | undefined)?.lastError).toContain("can't read");
    expect(afterCalls).toHaveLength(0);
    // The same delivery again changes nothing more.
    await POST(delivery("msg_7", body), ctx());
    expect(fake.queries.filter((q) => q.op === "update")).toHaveLength(1);
  });

  it("503s while the webhook secret isn't set, so Polar retries", async () => {
    fake = db({ token: "polar_oat_xxxxxxxx", webhookSecret: null });
    const res = await POST(delivery("msg_1", "{}"), ctx());
    expect(res.status).toBe(503);
  });

  it("404s an unknown or malformed connector id, and 503s with connectors off", async () => {
    fake = fakeDb(() => []);
    expect((await POST(delivery("msg_1", "{}"), ctx())).status).toBe(404);
    expect((await POST(delivery("msg_1", "{}"), ctx("not-a-uuid"))).status).toBe(404);
    delete process.env.CONNECTOR_SEAL_KEY;
    expect((await POST(delivery("msg_1", "{}"), ctx())).status).toBe(503);
  });
});
