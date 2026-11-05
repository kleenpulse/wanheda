import { describe, expect, it, vi } from "vitest";
import {
  currenciesOf,
  hasIncome,
  headline,
  monthlyRows,
  parity,
  parityDay,
  rangeMonths,
  revenueByMonth,
  revenueByMonthFor,
  revenueByProduct,
  scopeCurrencies,
  toFacts,
  type IncomeMovement,
  type IncomeSnapshot,
  type RevenueMonth,
} from "./income";
import { demoIncome } from "./income-server";
import { mrrAt } from "./mrr";

vi.mock("server-only", () => ({}));
vi.mock("./store", () => ({
  loadIncome: () => {
    throw new Error("demo must never read the database");
  },
}));

const mv = (over: Partial<IncomeMovement> & Pick<IncomeMovement, "occurredAt" | "kind" | "deltaMrrMinor">): IncomeMovement => ({
  productId: "p1",
  customerRef: "c1",
  currency: "USD",
  ...over,
});

const MOVEMENTS: IncomeMovement[] = [
  mv({ occurredAt: "2026-09-03T10:00:00Z", kind: "new", deltaMrrMinor: 900, customerRef: "a" }),
  mv({ occurredAt: "2026-09-20T10:00:00Z", kind: "new", deltaMrrMinor: 2900, customerRef: "b" }),
  mv({ occurredAt: "2026-10-05T10:00:00Z", kind: "expansion", deltaMrrMinor: 2000, customerRef: "a" }),
  mv({ occurredAt: "2026-10-12T10:00:00Z", kind: "churn", deltaMrrMinor: -2900, customerRef: "b" }),
  mv({ occurredAt: "2026-11-02T10:00:00Z", kind: "new", deltaMrrMinor: 500, customerRef: "c", productId: "p2" }),
  mv({ occurredAt: "2026-10-01T10:00:00Z", kind: "new", deltaMrrMinor: 100_000, customerRef: "n", currency: "NGN" }),
  mv({ occurredAt: "2026-10-01T10:00:00Z", kind: "new", deltaMrrMinor: 700, customerRef: "x", currency: "XTS" }),
];
const NOW = new Date("2026-11-05T12:00:00Z");

describe("toFacts", () => {
  it("sets aside a currency Wanheda can't format, never showing it as another", () => {
    const { facts, unknown } = toFacts(MOVEMENTS);
    expect(unknown).toEqual(["XTS"]);
    expect(facts.every((f) => f.currency !== ("XTS" as string))).toBe(true);
    expect(facts).toHaveLength(6);
  });
});

describe("currenciesOf", () => {
  it("ranks by MRR now within one currency each, never summing across", () => {
    const { facts } = toFacts(MOVEMENTS);
    // NGN holds 100 000 minor; USD 900 + 2000 + 500 = 3 400. Ranked by each one's own minor units.
    expect(currenciesOf(facts, NOW)).toEqual(["NGN", "USD"]);
  });
});

describe("monthlyRows", () => {
  const { facts } = toFacts(MOVEMENTS);
  const usd = facts.filter((f) => f.currency === "USD");
  const rows = monthlyRows(usd, ["2026-09", "2026-10", "2026-11"], NOW);

  it("bridges each month: start + Σ kinds = end, and the next month starts where it ended", () => {
    for (const r of rows) {
      const sum = Object.values(r.byKind).reduce((a, b) => a + b, 0);
      expect(r.startMrr + sum).toBe(r.mrr);
      expect(r.net).toBe(sum);
    }
    expect(rows.map((r) => [r.startMrr, r.mrr])).toEqual([
      [0, 3800],
      [3800, 2900],
      [2900, 3400],
    ]);
    expect(rows.map((r) => r.partial)).toEqual([false, false, true]);
  });

  it("matches the engine's MRR at each month end", () => {
    expect(rows[1]?.mrr).toBe(mrrAt(usd, new Date("2026-10-31T23:59:59.999Z")).mrr);
    expect(rows[1]?.byKind).toMatchObject({ expansion: 2000, churn: -2900 });
    expect(rows[1]?.customers).toBe(1);
  });

  it("headline: net new this month so far, last month whole, by kind", () => {
    const h = headline(usd, NOW);
    expect(h.thisMonth).toBe(500);
    expect(h.lastMonth).toBe(-900);
    expect(h.thisMonthByKind.new).toBe(500);
    expect(h.trailing.mrr).toBe(3400);
  });
});

describe("rangeMonths", () => {
  it("ends with now's month; all starts at the first movement", () => {
    const { facts } = toFacts(MOVEMENTS);
    expect(rangeMonths("6m", facts, NOW)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(rangeMonths("12m", facts, NOW)).toHaveLength(12);
    expect(rangeMonths("all", facts, NOW)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(rangeMonths("all", [], NOW)).toEqual(["2026-11"]);
  });
});

describe("revenue", () => {
  const lines = revenueByMonth([
    { kind: "order", objectId: "o1", productId: "p1", currency: "USD", amountMinor: 900, at: new Date("2026-10-03T00:00:00Z") },
    { kind: "order", objectId: "o2", productId: "p1", currency: "USD", amountMinor: 2900, at: new Date("2026-10-20T00:00:00Z") },
    { kind: "refund", objectId: "r1", productId: "p1", currency: "USD", amountMinor: -900, at: new Date("2026-10-06T00:00:00Z") },
    { kind: "order", objectId: "o3", productId: "p2", currency: "EUR", amountMinor: 500, at: new Date("2026-10-04T00:00:00Z") },
    { kind: "order", objectId: "o4", productId: "p2", currency: "USD", amountMinor: 4800, at: new Date("2026-11-01T00:00:00Z") },
  ]);

  it("keeps refunds as their own figure per month and currency", () => {
    expect(lines).toContainEqual({ productId: "p1", month: "2026-10", currency: "USD", ordersMinor: 3800, refundsMinor: -900 });
    expect(lines).toContainEqual({ productId: "p2", month: "2026-10", currency: "EUR", ordersMinor: 500, refundsMinor: 0 });
  });

  it("ranks products in one currency and only the months shown", () => {
    expect(revenueByProduct(lines, new Set(["2026-10", "2026-11"]), "USD")).toEqual([
      { productId: "p2", ordersMinor: 4800, refundsMinor: 0, netMinor: 4800 },
      { productId: "p1", ordersMinor: 3800, refundsMinor: -900, netMinor: 2900 },
    ]);
    expect(revenueByProduct(lines, new Set(["2026-10"]), "EUR")).toEqual([{ productId: "p2", ordersMinor: 500, refundsMinor: 0, netMinor: 500 }]);
    expect(revenueByMonthFor(lines, ["2026-10", "2026-11"], "p2", "USD")).toEqual([0, 4800]);
  });
});

describe("revenue without MRR (review FIX)", () => {
  const order = (over: Partial<RevenueMonth>): RevenueMonth => ({ productId: "p1", month: "2026-08", currency: "USD", ordersMinor: 4900, refundsMinor: 0, ...over });

  it("a one-time-sales payload is not empty and its revenue is reachable", () => {
    const revenue = [order({})];
    expect(hasIncome({ movements: [], revenue })).toBe(true);
    expect(hasIncome({ movements: [], revenue: [] })).toBe(false);
    expect(scopeCurrencies([], revenue, NOW)).toEqual(["USD"]);
    expect(revenueByProduct(revenue, new Set(rangeMonths("all", [], NOW, revenue)), "USD")).toEqual([
      { productId: "p1", ordersMinor: 4900, refundsMinor: 0, netMinor: 4900 },
    ]);
  });

  it("offers a currency that only has orders, after the MRR ones", () => {
    const { facts } = toFacts(MOVEMENTS);
    const usd = facts.filter((f) => f.currency === "USD");
    const revenue = [order({ currency: "EUR", month: "2026-10" }), order({ currency: "XTS" })];
    expect(scopeCurrencies(usd, revenue, NOW)).toEqual(["USD", "EUR"]);
    expect(revenueByProduct(revenue, new Set(["2026-10"]), "EUR")).toHaveLength(1);
  });

  it("all time starts at the earlier of the first movement and the first paid month", () => {
    const { facts } = toFacts(MOVEMENTS);
    expect(rangeMonths("all", facts, NOW, [order({ month: "2026-07" })])[0]).toBe("2026-07");
  });

  it("drops revenue in a currency Wanheda can't format", () => {
    expect(revenueByMonth([{ kind: "order", objectId: "o", productId: "p1", currency: "XTS", amountMinor: 1, at: NOW }])).toEqual([]);
  });
});

describe("parity (V36)", () => {
  const snap = (over: Partial<IncomeSnapshot>): IncomeSnapshot => ({
    productId: "p1",
    onDate: "2026-11-04",
    source: "computed",
    currency: "USD",
    mrrMinor: 10_000,
    customers: 10,
    arpaMinor: 1000,
    otherCurrencies: false,
    ...over,
  });

  it("matches within 1 minor unit per active subscription, marks anything more", () => {
    const ours = snap({});
    expect(parityDay("d", ours, snap({ source: "polar", mrrMinor: 10_010, customers: 10 })).state).toBe("match");
    const off = parityDay("d", ours, snap({ source: "polar", mrrMinor: 10_011, customers: 10 }));
    expect(off).toMatchObject({ state: "off", diffMinor: 11, toleranceMinor: 10 });
    expect(parityDay("d", ours, snap({ source: "polar", mrrMinor: 9_989, customers: 10 })).state).toBe("off");
    // No subscriptions on Polar's side: any difference is off.
    expect(parityDay("d", snap({ mrrMinor: 1 }), snap({ source: "polar", mrrMinor: 0, customers: 0 })).state).toBe("off");
  });

  it("never compares across currencies or a row that left a currency out", () => {
    expect(parityDay("d", snap({ currency: "EUR" }), snap({ source: "polar" })).state).toBe("currency");
    expect(parityDay("d", snap({ otherCurrencies: true }), snap({ source: "polar" })).state).toBe("currency");
    expect(parityDay("d", null, snap({ source: "polar" })).state).toBe("no-computed");
    expect(parityDay("d", snap({}), null).state).toBe("no-polar");
  });

  it("reads per product only, newest day with both sides as latest, and counts off days", () => {
    const rows = parity(
      [
        snap({ onDate: "2026-11-05" }),
        snap({ onDate: "2026-11-04" }),
        snap({ onDate: "2026-11-04", source: "polar", mrrMinor: 12_000 }),
        snap({ onDate: "2026-11-03" }),
        snap({ onDate: "2026-11-03", source: "polar" }),
        snap({ productId: null, onDate: "2026-11-04", source: "polar", mrrMinor: 99_999 }),
      ],
      ["p1"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.days.map((d) => [d.onDate, d.state])).toEqual([
      ["2026-11-05", "no-polar"],
      ["2026-11-04", "off"],
      ["2026-11-03", "match"],
    ]);
    expect(rows[0]?.latest?.onDate).toBe("2026-11-04");
    expect(rows[0]?.offDays).toBe(1);
  });
});

describe("demoIncome", () => {
  it("builds from the seed without the database, and marks its one sample off day", () => {
    const demo = demoIncome(NOW);
    expect(demo.source).toBe("demo");
    expect(demo.movements.length).toBeGreaterThan(0);
    expect(demo.revenue.some((r) => r.refundsMinor < 0)).toBe(true);
    const rows = parity(
      demo.snapshots,
      demo.products.map((p) => p.id),
    );
    expect(rows.map((r) => r.offDays)).toEqual([0, 1]);
    // Our computed snapshot for today equals the movements' MRR.
    const { facts } = toFacts(demo.movements);
    const p1 = demo.products[0]?.id ?? "";
    const today = demo.snapshots.find((s) => s.productId === p1 && s.source === "computed" && s.onDate === "2026-11-05");
    expect(today?.mrrMinor).toBe(mrrAt(facts.filter((f) => f.productId === p1), new Date("2026-11-05T23:59:59.999Z")).mrr);
  });
});
