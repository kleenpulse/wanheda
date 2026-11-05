import { beforeEach, describe, expect, it, vi } from "vitest";
import { movementsFrom, type EngineEvent, type Movement } from "./mrr";

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({
  loadReconcileFacts: vi.fn(),
  loadEvents: vi.fn(),
  countEvents: vi.fn(),
  writeDerived: vi.fn(),
}));
vi.mock("./store", () => store);
vi.mock("@/lib/notifications/store", () => ({ addNotices: vi.fn(() => Promise.resolve([])) }));

const { reconcile } = await import("./reconcile");

const CONNECTOR = "c-1";
const NOW = new Date("2026-11-05T12:00:00Z");
const MAP = new Map([["prod_pro", "p-motion"]]);
const FACTS = { userId: "owner-1", config: { server: "sandbox", organizationId: null, productMap: { prod_pro: "p-motion" }, products: [] }, products: [{ id: "p-motion", name: "Motion Garden", archived: false }] };

function sub(id: string, customer: string, at: string): EngineEvent {
  const payload = { id, created_at: at, started_at: at, modified_at: at, status: "active", amount: 1500, currency: "usd", recurring_interval: "month", customer_id: customer, product_id: "prod_pro" };
  return { id: `be-${id}`, eventId: `wh-${id}`, kind: "subscription", occurredAt: new Date(at), objectId: id, payload };
}
const A = sub("sub_a", "cus_a", "2026-10-01T10:00:00Z");
const B = sub("sub_b", "cus_b", "2026-11-05T11:59:00Z");

/** The movements of the last write. */
const lastWrite = (): Movement[] => (store.writeDerived.mock.calls.at(-1)?.[2] ?? []) as Movement[];

beforeEach(() => {
  vi.clearAllMocks();
  store.loadReconcileFacts.mockResolvedValue(FACTS);
  store.writeDerived.mockResolvedValue(true);
});

describe("reconcile under a burst of webhooks", () => {
  it("runs again when the log grew while it wrote, so the last write holds the newest log", async () => {
    // This run read {A}; B landed (and another run wrote {A,B}) before its own write finished.
    store.loadEvents.mockResolvedValueOnce([A]).mockResolvedValue([A, B]);
    store.countEvents.mockResolvedValue(2);
    const summary = await reconcile(CONNECTOR, NOW);
    expect(store.writeDerived).toHaveBeenCalledTimes(2);
    expect(lastWrite()).toEqual(movementsFrom([A, B], { productMap: MAP, asOf: NOW }));
    expect(summary).toMatchObject({ events: 2, movements: 2 });
  });

  it("retries a write that failed against a concurrent one and ends with the full log", async () => {
    store.loadEvents.mockResolvedValue([A, B]);
    store.countEvents.mockResolvedValue(2);
    store.writeDerived.mockRejectedValueOnce(Object.assign(new Error("duplicate key value"), { code: "23505" }));
    await reconcile(CONNECTOR, NOW);
    expect(store.writeDerived).toHaveBeenCalledTimes(2);
    expect(lastWrite()).toEqual(movementsFrom([A, B], { productMap: MAP, asOf: NOW }));
  });

  it("writes once when nothing landed meanwhile, and gives up after three runs of a log that keeps growing", async () => {
    store.loadEvents.mockResolvedValue([A]);
    store.countEvents.mockResolvedValue(1);
    await reconcile(CONNECTOR, NOW);
    expect(store.writeDerived).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    store.loadReconcileFacts.mockResolvedValue(FACTS);
    store.writeDerived.mockResolvedValue(true);
    store.loadEvents.mockResolvedValue([A]);
    store.countEvents.mockResolvedValue(99);
    await reconcile(CONNECTOR, NOW);
    expect(store.writeDerived).toHaveBeenCalledTimes(3);
  });
});
