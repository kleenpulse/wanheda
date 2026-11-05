import { describe, expect, it } from "vitest";
import { incomeAlerts } from "./alerts";
import { movementsFrom, type EngineEvent } from "./mrr";

const MAP = new Map([["prod_pro", "p-motion"]]);
const NAMES = new Map([["p-motion", "Motion Garden"]]);

function snap(at: string, over: Record<string, unknown> = {}, via = at): EngineEvent {
  const payload = {
    id: "sub_1",
    created_at: "2026-09-01T10:00:00Z",
    status: "active",
    amount: 1500,
    currency: "usd",
    recurring_interval: "month",
    customer_id: "cus_1",
    product_id: "prod_pro",
    ...over,
  };
  return { id: `be-${via}`, eventId: via, kind: "subscription", occurredAt: new Date(at), objectId: payload.id, payload };
}

const alertsAt = (events: EngineEvent[], now: string) => {
  const asOf = new Date(now);
  return incomeAlerts({ movements: movementsFrom(events, { productMap: MAP, asOf }), events, productMap: MAP, productNames: NAMES, now: asOf });
};

describe("incomeAlerts", () => {
  it("alerts a new customer and a churn within 48 h, with no amount in the text", () => {
    const events = [
      snap("2026-11-04T10:00:00Z", { created_at: "2026-11-04T10:00:00Z" }),
      snap("2026-11-05T09:00:00Z", { created_at: "2026-11-04T10:00:00Z", status: "canceled", ended_at: "2026-11-05T09:00:00Z" }),
    ];
    const out = alertsAt(events, "2026-11-05T12:00:00Z");
    expect(out.map((n) => n.dedupeKey)).toEqual(["saas:p-motion:new:cus_1", "saas:p-motion:churn:cus_1:2026-11-05"]);
    expect(out.every((n) => !/\d/.test(`${n.title}${n.body ?? ""}`))).toBe(true);
  });

  it("stays quiet about old history (first sync) and gives the same keys on a rerun", () => {
    const events = [snap("2026-09-01T10:00:00Z")];
    expect(alertsAt(events, "2026-11-05T12:00:00Z")).toEqual([]);
    const fresh = [snap("2026-11-05T10:00:00Z", { created_at: "2026-11-05T10:00:00Z" })];
    expect(alertsAt(fresh, "2026-11-05T12:00:00Z")).toEqual(alertsAt(fresh, "2026-11-05T12:00:00Z"));
  });

  it("keys a failed payment by when the past_due run began", () => {
    const events = [
      snap("2026-09-01T10:00:00Z"),
      snap("2026-11-04T10:00:00Z", { status: "past_due" }),
      snap("2026-11-05T10:00:00Z", { status: "past_due" }),
    ];
    const keys = alertsAt(events, "2026-11-05T12:00:00Z").map((n) => n.dedupeKey);
    expect(keys).toEqual(["saas:p-motion:failed:sub_1:2026-11-04T10:00:00.000Z"]);
  });

  it("raises an MRR milestone once, when crossed upwards, per product and overall", () => {
    const events = [
      snap("2026-09-01T10:00:00Z", { amount: 9000 }),
      snap("2026-11-05T10:00:00Z", { amount: 11000 }),
    ];
    const out = alertsAt(events, "2026-11-05T12:00:00Z");
    expect(out.map((n) => `${n.dedupeKey} | ${n.title}`)).toEqual(["saas:p-motion:mrr:USD100 | $100 MRR", "saas:all:mrr:USD100 | $100 MRR"]);
  });
});
