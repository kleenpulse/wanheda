import { describe, expect, it } from "vitest";
import { compareEvents, fromPull, fromWebhook, kindOfWebhook, latestSnapshots, toBillingEvent, type BillingEventInput } from "./events";

/** The value, or a failed test. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const sub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  created_at: "2026-10-01T10:00:00Z",
  modified_at: "2026-10-01T10:00:00Z",
  status: "active",
  amount: 1500,
  currency: "usd",
  recurring_interval: "month",
  recurring_interval_count: 1,
  customer_id: "cus_1",
  product_id: "prod_pro",
  customer: { email: "kept@payload.test" },
  ...over,
});

const order = (over: Record<string, unknown> = {}) => ({
  id: "ord_1",
  created_at: "2026-10-01T10:00:05Z",
  modified_at: null,
  status: "paid",
  currency: "usd",
  customer_id: "cus_1",
  product_id: "prod_pro",
  subscription_id: "sub_1",
  ...over,
});

const refund = (over: Record<string, unknown> = {}) => ({
  id: "ref_1",
  created_at: "2026-10-03T09:00:00Z",
  modified_at: null,
  status: "succeeded",
  amount: 1500,
  currency: "usd",
  order_id: "ord_1",
  customer_id: "cus_1",
  subscription_id: "sub_1",
  ...over,
});

describe("webhook types", () => {
  it("keeps subscription, order and refund events only", () => {
    expect(kindOfWebhook("subscription.updated")).toBe("subscription");
    expect(kindOfWebhook("order.refunded")).toBe("order");
    expect(kindOfWebhook("refund.created")).toBe("refund");
    expect(kindOfWebhook("checkout.created")).toBeNull();
    expect(kindOfWebhook("customer.state_changed")).toBeNull();
    expect(fromWebhook({ type: "benefit_grant.created", data: {} }, "msg_1")).toBe("ignored");
    expect(fromWebhook({ nope: true }, "msg_1")).toBeNull();
  });
});

describe("toBillingEvent", () => {
  it("maps refs per kind and keeps the whole object as payload", () => {
    const s = fromWebhook({ type: "subscription.created", data: sub() }, "msg_1") as BillingEventInput;
    expect(s).toMatchObject({ eventId: "msg_1", kind: "subscription", objectId: "sub_1", customerRef: "cus_1", subscriptionRef: "sub_1", orderRef: null, providerProductId: "prod_pro" });
    expect(s.payload.customer).toEqual({ email: "kept@payload.test" });

    const o = must(toBillingEvent("order", order(), "msg_2"));
    expect(o).toMatchObject({ orderRef: "ord_1", subscriptionRef: "sub_1", customerRef: "cus_1" });
    // modified_at null ⇒ created_at is the change time
    expect(o.occurredAt.toISOString()).toBe("2026-10-01T10:00:05.000Z");

    const r = must(toBillingEvent("refund", refund(), "msg_3"));
    expect(r).toMatchObject({ orderRef: "ord_1", providerProductId: null });
  });

  it("accepts statuses and intervals Polar may add later", () => {
    expect(toBillingEvent("subscription", sub({ status: "frozen", recurring_interval: "fortnight" }), "m")).not.toBeNull();
  });

  it("refuses an object missing what we key on", () => {
    expect(toBillingEvent("subscription", sub({ customer_id: undefined }), "m")).toBeNull();
    expect(toBillingEvent("subscription", sub({ amount: 12.5 }), "m")).toBeNull();
    expect(toBillingEvent("refund", refund({ order_id: "" }), "m")).toBeNull();
    expect(toBillingEvent("order", order({ created_at: "yesterday" }), "m")).toBeNull();
  });
});

describe("fromPull", () => {
  it("names the snapshot, so the same state pulled twice has the same id", () => {
    const a = must(fromPull("subscription", sub()));
    const b = must(fromPull("subscription", sub()));
    expect(a.eventId).toBe("sync:subscription:sub_1:2026-10-01T10:00:00.000Z");
    expect(b.eventId).toBe(a.eventId);
    expect(must(fromPull("subscription", sub({ modified_at: "2026-10-02T00:00:00Z" }))).eventId).not.toBe(a.eventId);
  });
});

describe("latestSnapshots", () => {
  const created = must(toBillingEvent("subscription", sub(), "msg_a"));
  const canceled = must(toBillingEvent("subscription", sub({ status: "canceled", modified_at: "2026-10-20T00:00:00Z" }), "msg_b"));

  it("same delivery 3× ⇒ same state as once", () => {
    expect(latestSnapshots([created, created, created], "subscription")).toEqual(latestSnapshots([created], "subscription"));
  });

  it("an older snapshot landing later never wins", () => {
    const inOrder = latestSnapshots([created, canceled], "subscription");
    const outOfOrder = latestSnapshots([canceled, created], "subscription");
    expect(inOrder.get("sub_1")?.payload.status).toBe("canceled");
    expect(outOfOrder).toEqual(inOrder);
  });

  it("ties on change time break by event id, not arrival", () => {
    const x = { ...created, eventId: "a" };
    const y = { ...created, eventId: "b", payload: { ...created.payload, status: "past_due" } };
    expect(latestSnapshots([y, x], "subscription").get("sub_1")?.eventId).toBe("b");
    expect(latestSnapshots([x, y], "subscription").get("sub_1")?.eventId).toBe("b");
    expect(compareEvents(x, x)).toBe(0);
  });

  it("keeps a refund that arrives before its order", () => {
    const r = must(toBillingEvent("refund", refund(), "msg_r"));
    const o = must(toBillingEvent("order", order(), "msg_o"));
    expect(latestSnapshots([r], "refund").get("ref_1")?.orderRef).toBe("ord_1");
    const later = [r, o];
    expect(latestSnapshots(later, "refund").size).toBe(1);
    expect(latestSnapshots(later, "order").get("ord_1")?.objectId).toBe("ord_1");
  });
});
