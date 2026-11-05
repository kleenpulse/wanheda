import { describe, expect, it } from "vitest";
import { metrics, movementsFrom, mrrAt, revenueFrom, subscriptionMrr, type EngineEvent, type Movement } from "./mrr";

const MAP = new Map([
  ["prod_pro", "p-motion"],
  ["prod_team", "p-motion"],
  ["prod_raw", "p-raw"],
]);

let n = 0;
/** One subscription snapshot as stored: `via` names the copy (webhook delivery or pull). */
function snap(at: string, over: Record<string, unknown> = {}, via = `wh_${++n}`): EngineEvent {
  const payload = {
    id: "sub_1",
    created_at: "2026-09-01T10:00:00Z",
    started_at: "2026-09-01T10:00:00Z",
    modified_at: at,
    status: "active",
    amount: 1500,
    currency: "usd",
    recurring_interval: "month",
    recurring_interval_count: 1,
    customer_id: "cus_1",
    product_id: "prod_pro",
    cancel_at_period_end: false,
    ends_at: null,
    ended_at: null,
    trial_end: null,
    ...over,
  };
  return { id: `be-${via}`, eventId: via, kind: "subscription", occurredAt: new Date(at), objectId: payload.id, payload };
}

const run = (events: readonly EngineEvent[], asOf = "2027-01-01T00:00:00Z") =>
  movementsFrom(events, { productMap: MAP, asOf: new Date(asOf) });

const brief = (ms: readonly Movement[]) => ms.map((m) => `${m.occurredAt.toISOString().slice(0, 10)} ${m.kind} ${m.deltaMrrMinor}`);

describe("subscriptionMrr", () => {
  it("normalises every interval to a month, rounding half-even once", () => {
    const at = (amount: number, recurring_interval: string, recurring_interval_count: number | null = 1) =>
      subscriptionMrr({ amount, recurring_interval, recurring_interval_count });
    expect(at(1500, "month")).toBe(1500);
    expect(at(12000, "year")).toBe(1000);
    expect(at(4500, "month", 3)).toBe(1500);
    expect(at(1000, "week")).toBe(4333); // 1000 × 52 ÷ 12 = 4333.3
    expect(at(100, "day")).toBe(3042); // 100 × 365 ÷ 12 = 3041.7
    expect(at(30, "year")).toBe(2); // 2.5 → 2 (half-even)
    expect(at(1500, "fortnight")).toBeNull();
  });
});

describe("movementsFrom", () => {
  it("starts MRR on the day the subscription started, even when first seen later", () => {
    expect(brief(run([snap("2026-10-20T08:00:00Z")]))).toEqual(["2026-09-01 new 1500"]);
  });

  it("counts a webhook copy and a pull copy of one state once (transitions only)", () => {
    const a = snap("2026-10-20T08:00:00Z", {}, "wh_a");
    const b = snap("2026-10-20T08:00:00Z", {}, "sync:subscription:sub_1:2026-10-20T08:00:00.000Z");
    expect(brief(run([a, b]))).toEqual(brief(run([a])));
  });

  it("gives identical rows on a rebuild and whatever order the events arrived in", () => {
    const e1 = snap("2026-09-01T10:00:00Z", {}, "e1");
    const e2 = snap("2026-10-01T10:00:00Z", { amount: 3000, product_id: "prod_team" }, "e2");
    const e3 = snap("2026-11-01T10:00:00Z", { amount: 1500 }, "e3");
    const e4 = snap("2026-11-10T10:00:00Z", { status: "canceled", ended_at: "2026-11-10T10:00:00Z" }, "e4");
    const events = [e1, e2, e3, e4];
    const first = run(events);
    expect(run(events)).toEqual(first);
    expect(run([...events].reverse())).toEqual(first);
    expect(run([e3, e1, e4, e2])).toEqual(first);
    expect(brief(first)).toEqual(["2026-09-01 new 1500", "2026-10-01 expansion 1500", "2026-11-01 contraction -1500", "2026-11-10 churn -1500"]);
    expect(new Set(first.map((m) => m.key)).size).toBe(first.length);
  });

  it("never lets an older snapshot that lands later regress the state", () => {
    const newer = snap("2026-10-05T00:00:00Z", { amount: 3000 }, "e-new");
    const older = snap("2026-10-01T00:00:00Z", { amount: 1500 }, "e-old");
    const out = run([newer, older]);
    expect(mrrAt(out, new Date("2026-12-01T00:00:00Z")).mrr).toBe(3000);
    expect(brief(out)).toEqual(["2026-09-01 new 1500", "2026-10-05 expansion 1500"]);
  });

  it("churns a cancel-at-period-end on the end date, not the cancel date, once that date has come", () => {
    const events = [
      snap("2026-09-01T10:00:00Z", {}, "e1"),
      snap("2026-11-10T09:00:00Z", { cancel_at_period_end: true, ends_at: "2026-12-01T10:00:00Z" }, "e2"),
    ];
    expect(brief(run(events, "2026-11-20T00:00:00Z"))).toEqual(["2026-09-01 new 1500"]);
    const later = run(events, "2026-12-05T00:00:00Z");
    expect(brief(later)).toEqual(["2026-09-01 new 1500", "2026-12-01 churn -1500"]);
    // Polar's own "it ended" snapshot, arriving after the end, adds nothing.
    const ended = snap("2026-12-01T10:00:05Z", { status: "canceled", cancel_at_period_end: true, ends_at: "2026-12-01T10:00:00Z", ended_at: "2026-12-01T10:00:00Z" }, "e3");
    expect(run([...events, ended], "2026-12-05T00:00:00Z")).toEqual(later);
  });

  it("drops a scheduled churn when the cancel is undone before the end", () => {
    const events = [
      snap("2026-09-01T10:00:00Z", {}, "e1"),
      snap("2026-11-10T09:00:00Z", { cancel_at_period_end: true, ends_at: "2026-12-01T10:00:00Z" }, "e2"),
      snap("2026-11-15T09:00:00Z", {}, "e3"),
    ];
    expect(brief(run(events))).toEqual(["2026-09-01 new 1500"]);
  });

  it("counts a trial as 0, then new when it converts", () => {
    const trial = { started_at: "2026-10-01T10:00:00Z", trial_end: "2026-10-15T10:00:00Z" };
    const events = [
      snap("2026-10-01T10:00:00Z", { ...trial, status: "trialing" }, "e1"),
      snap("2026-10-15T10:00:00Z", { ...trial, status: "active" }, "e2"),
    ];
    expect(brief(run(events, "2026-10-10T00:00:00Z"))).toEqual([]);
    expect(brief(run(events))).toEqual(["2026-10-15 new 1500"]);
  });

  it("never counts a trial cancelled before it converted", () => {
    const trial = { started_at: "2026-10-01T10:00:00Z", trial_end: "2026-10-15T10:00:00Z" };
    const events = [
      snap("2026-10-01T10:00:00Z", { ...trial, status: "trialing" }, "e1"),
      snap("2026-10-12T10:00:00Z", { ...trial, status: "canceled", ended_at: "2026-10-12T10:00:00Z" }, "e2"),
    ];
    expect(run(events)).toEqual([]);
  });

  it("keeps past_due counting until revoked", () => {
    const events = [
      snap("2026-09-01T10:00:00Z", {}, "e1"),
      snap("2026-10-01T10:00:00Z", { status: "past_due" }, "e2"),
      snap("2026-10-08T10:00:00Z", { status: "canceled", ended_at: "2026-10-08T10:00:00Z" }, "e3"),
    ];
    expect(brief(run(events))).toEqual(["2026-09-01 new 1500", "2026-10-08 churn -1500"]);
  });

  it("calls a comeback a reactivation, and a same-day plan swap one expansion", () => {
    const second = (at: string, over: Record<string, unknown> = {}) => snap(at, { id: "sub_2", started_at: at, created_at: at, ...over });
    const events = [
      snap("2026-09-01T10:00:00Z", {}, "e1"),
      snap("2026-09-20T10:00:00Z", { status: "canceled", ended_at: "2026-09-20T10:00:00Z" }, "e2"),
      second("2026-10-01T10:00:00Z"),
      // Same day: sub_2 cancelled, sub_3 on a bigger plan.
      snap("2026-11-01T09:00:00Z", { id: "sub_2", started_at: "2026-10-01T10:00:00Z", status: "canceled", ended_at: "2026-11-01T09:00:00Z" }),
      snap("2026-11-01T09:05:00Z", { id: "sub_3", started_at: "2026-11-01T09:05:00Z", amount: 4000 }),
    ];
    expect(brief(run(events))).toEqual([
      "2026-09-01 new 1500",
      "2026-09-20 churn -1500",
      "2026-10-01 reactivation 1500",
      "2026-11-01 expansion 2500",
    ]);
  });

  it("leaves unmapped products out and moves MRR between mapped ones", () => {
    expect(run([snap("2026-10-01T00:00:00Z", { product_id: "prod_unknown" })])).toEqual([]);
    const out = run([snap("2026-09-01T10:00:00Z", {}, "e1"), snap("2026-10-01T10:00:00Z", { product_id: "prod_raw" }, "e2")]);
    expect(out.map((m) => `${m.productId} ${m.kind} ${m.deltaMrrMinor}`)).toEqual(["p-motion new 1500", "p-motion churn -1500", "p-raw new 1500"]);
  });

  it("keeps Σ movements equal to the MRR of every live subscription at the end of every day", () => {
    const subs = [
      [snap("2026-09-03T05:00:00Z", { id: "a", customer_id: "c1", started_at: "2026-09-03T05:00:00Z" }), snap("2026-10-07T05:00:00Z", { id: "a", customer_id: "c1", started_at: "2026-09-03T05:00:00Z", amount: 2500 })],
      [snap("2026-09-10T05:00:00Z", { id: "b", customer_id: "c2", started_at: "2026-09-10T05:00:00Z", amount: 12000, recurring_interval: "year" }), snap("2026-11-02T05:00:00Z", { id: "b", customer_id: "c2", started_at: "2026-09-10T05:00:00Z", amount: 12000, recurring_interval: "year", status: "canceled", ended_at: "2026-11-02T05:00:00Z" })],
      [snap("2026-10-15T05:00:00Z", { id: "c", customer_id: "c1", started_at: "2026-10-15T05:00:00Z", amount: 700 })],
    ];
    const out = run(subs.flat());
    // Direct: each subscription's MRR from its own snapshots, by hand.
    const expected = (day: string): number => {
      const t = Date.parse(`${day}T23:59:59Z`);
      let total = 0;
      if (t >= Date.parse("2026-09-03T05:00:00Z")) total += t >= Date.parse("2026-10-07T05:00:00Z") ? 2500 : 1500;
      if (t >= Date.parse("2026-09-10T05:00:00Z") && t < Date.parse("2026-11-02T05:00:00Z")) total += 1000;
      if (t >= Date.parse("2026-10-15T05:00:00Z")) total += 700;
      return total;
    };
    for (let d = Date.parse("2026-08-30T00:00:00Z"); d < Date.parse("2026-11-30T00:00:00Z"); d += 86_400_000) {
      const day = new Date(d).toISOString().slice(0, 10);
      expect(mrrAt(out, new Date(`${day}T23:59:59.999Z`)).mrr, day).toBe(expected(day));
    }
  });
});

describe("metrics", () => {
  it("shows — (null) for every zero denominator", () => {
    const m = metrics([], new Date("2026-10-01"), new Date("2026-11-01"));
    expect(m).toMatchObject({ mrr: 0, arr: 0, netNew: 0, customers: 0, arpa: null, customerChurn: null, netMrrChurn: null, ltv: null });
  });

  it("computes ARPA, churn and LTV over a period", () => {
    const at = (day: string, customerRef: string, kind: Movement["kind"], deltaMrrMinor: number) => ({ occurredAt: new Date(`${day}T12:00:00Z`), customerRef, kind, deltaMrrMinor });
    const ms = [
      at("2026-09-05", "a", "new", 1000),
      at("2026-09-06", "b", "new", 2000),
      at("2026-09-07", "c", "new", 3000),
      at("2026-09-08", "d", "new", 4000),
      at("2026-10-03", "a", "churn", -1000),
      at("2026-10-04", "b", "expansion", 500),
      at("2026-10-05", "e", "new", 1500),
    ];
    const m = metrics(ms, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(m.mrr).toBe(11000);
    expect(m.arr).toBe(132000);
    expect(m.netNew).toBe(1000);
    expect(m.customers).toBe(4);
    expect(m.arpa).toBe(2750);
    expect(m.customerChurn).toBe(0.25);
    // (1000 churn − 500 expansion) ÷ 10000 at start.
    expect(m.netMrrChurn).toBe(0.05);
    // ARPA 2750 ÷ 0.25.
    expect(m.ltv).toBe(11000);
  });

  it("doesn't count a customer who drops one product but keeps another as lost (overall view)", () => {
    const at = (day: string, customerRef: string, kind: Movement["kind"], deltaMrrMinor: number) => ({ occurredAt: new Date(`${day}T12:00:00Z`), customerRef, kind, deltaMrrMinor });
    const ms = [at("2026-09-05", "a", "new", 1000), at("2026-09-06", "a", "new", 500), at("2026-10-03", "a", "churn", -1000)];
    const m = metrics(ms, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(m.customerChurn).toBe(0);
    expect(m.ltv).toBeNull();
  });
});

describe("revenueFrom", () => {
  const ev = (kind: "order" | "refund", id: string, at: string, payload: Record<string, unknown>, via: string): EngineEvent => ({
    id: `be-${via}`,
    eventId: via,
    kind,
    occurredAt: new Date(at),
    objectId: id,
    payload: { id, created_at: at, ...payload },
  });
  const order = ev("order", "ord_1", "2026-10-01T10:00:00Z", { status: "paid", currency: "usd", net_amount: 1500, product_id: "prod_pro" }, "o1");
  const refund = ev("refund", "ref_1", "2026-10-03T10:00:00Z", { status: "succeeded", currency: "usd", amount: 500, order_id: "ord_1" }, "r1");

  it("keeps a refund that landed before its order and counts it once the order arrives", () => {
    expect(revenueFrom([refund], MAP)).toEqual([]);
    const lines = revenueFrom([refund, order], MAP);
    expect(lines.map((l) => `${l.kind} ${l.productId} ${l.amountMinor}`)).toEqual(["order p-motion 1500", "refund p-motion -500"]);
    expect(revenueFrom([order, refund, refund], MAP)).toEqual(lines);
  });

  it("uses each object's latest state: a refund still pending counts nothing", () => {
    const pending = { ...refund, eventId: "r0", id: "be-r0", occurredAt: new Date("2026-10-02T10:00:00Z"), payload: { ...refund.payload, status: "pending" } };
    expect(revenueFrom([order, pending], MAP).map((l) => l.kind)).toEqual(["order"]);
    expect(revenueFrom([order, refund, pending], MAP).map((l) => l.kind)).toEqual(["order", "refund"]);
  });
});
