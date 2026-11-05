import { describe, expect, it } from "vitest";
import { byId, type Account, type Category, type Txn } from "./money";
import {
  accountBalance,
  breakdown,
  bucketTotals,
  cumulative,
  currenciesIn,
  dailyTotals,
  heatLevel,
  heatThresholds,
  NONE,
  percentChange,
} from "./reports";
import { bucketsOf, customPeriod } from "./periods";

const cat = (id: string, kind: Category["kind"], parentId: string | null = null): Category => ({
  id,
  slug: null,
  name: id,
  parentId,
  emoji: "",
  color: "blue",
  kind,
  archived: false,
});

const CATS = byId([cat("food", "expense"), cat("eat-out", "expense", "food"), cat("rides", "expense"), cat("salary", "income"), cat("move", "transfer")]);

let n = 0;
const txn = (postedOn: string, amountMinor: number, extra: Partial<Txn> = {}): Txn => ({
  id: `t${String(++n)}`,
  accountId: "cash",
  postedOn,
  amountMinor,
  currency: "NGN",
  payee: "",
  categoryId: null,
  note: "",
  tags: [],
  source: "manual",
  transferId: null,
  createdAt: n,
  ...extra,
});

const NOV = { from: "2026-11-01", to: "2026-11-30" };
const OCT = { from: "2026-10-01", to: "2026-10-31" };

describe("dailyTotals", () => {
  it("sums one side per day in one currency, never across currencies or transfers", () => {
    const txns = [
      txn("2026-11-03", -150_000, { categoryId: "food" }),
      txn("2026-11-03", -50_000, { categoryId: "eat-out" }),
      txn("2026-11-03", -999, { currency: "USD" }),
      txn("2026-11-03", -10_000, { transferId: "x" }),
      txn("2026-11-03", -20_000, { categoryId: "move" }),
      txn("2026-11-04", 5_000_000, { categoryId: "salary" }),
      // A refund into a spend category lowers that day's spend.
      txn("2026-11-04", 30_000, { categoryId: "food" }),
      txn("2026-10-31", -70_000),
    ];
    const spend = dailyTotals(txns, CATS, NOV, "NGN", "spend");
    expect(Object.fromEntries(spend)).toEqual({ "2026-11-03": 200_000, "2026-11-04": -30_000 });
    expect(Object.fromEntries(dailyTotals(txns, CATS, NOV, "NGN", "income"))).toEqual({ "2026-11-04": 5_000_000 });
    expect(Object.fromEntries(dailyTotals(txns, CATS, NOV, "USD", "spend"))).toEqual({ "2026-11-03": 999 });
  });

  it("matches a hand count across buckets and the running total", () => {
    const daily = new Map([
      ["2026-10-01", 100],
      ["2026-10-02", 250],
      ["2026-10-08", 1_000],
    ]);
    const p = customPeriod("2026-10-01", "2026-10-08");
    expect(bucketTotals(daily, bucketsOf(p))).toEqual([100, 250, 0, 0, 0, 0, 0, 1_000]);
    expect(cumulative(daily, p.from, p.to)).toEqual([100, 350, 350, 350, 350, 350, 350, 1_350]);
  });

  it("throws rather than round past a safe integer", () => {
    const big = [txn("2026-11-01", -Number.MAX_SAFE_INTEGER), txn("2026-11-01", -1)];
    expect(() => dailyTotals(big, CATS, NOV, "NGN", "spend")).toThrow();
  });
});

describe("breakdown", () => {
  const txns = [
    txn("2026-11-02", -100_000, { categoryId: "food", payee: "Shoprite" }),
    txn("2026-11-02", -40_000, { categoryId: "eat-out", payee: "Mama Put" }),
    txn("2026-11-03", -30_000, { categoryId: "eat-out", payee: "  mama  put " }),
    txn("2026-11-03", -5_000, { categoryId: "rides", accountId: "bank", payee: "Uber" }),
    txn("2026-11-04", -1_000, { payee: "" }),
    txn("2026-10-02", -80_000, { categoryId: "food", payee: "Shoprite" }),
    txn("2026-10-03", -60_000, { categoryId: "rides", accountId: "bank" }),
    txn("2026-10-03", -7_000, { categoryId: "rides", currency: "USD" }),
  ];

  it("rolls children into their parent, keeps them listed, and compares", () => {
    const rows = breakdown({ txns, categories: CATS, range: NOV, prev: OCT, currency: "NGN", side: "spend", by: "category" });
    expect(rows.map((r) => [r.key, r.minor, r.prevMinor, r.count])).toEqual([
      ["food", 170_000, 80_000, 3],
      ["rides", 5_000, 60_000, 1],
      [NONE, 1_000, 0, 1],
    ]);
    expect(rows[0]?.children.map((r) => [r.key, r.minor])).toEqual([["eat-out", 70_000]]);
    // Rows add up to the period's total.
    expect(rows.reduce((s, r) => s + r.minor, 0)).toBe(176_000);
  });

  it("groups payees by normalised name and keeps the latest spelling", () => {
    const rows = breakdown({ txns, categories: CATS, range: NOV, prev: OCT, currency: "NGN", side: "spend", by: "payee" });
    const mama = rows.find((r) => r.key === "mama put");
    expect(mama).toMatchObject({ minor: 70_000, count: 2, label: "Mama Put" });
    expect(rows.find((r) => r.key === "")?.minor).toBe(1_000);
  });

  it("keeps a row that only spent in the earlier range", () => {
    const rows = breakdown({ txns, categories: CATS, range: { from: "2026-11-04", to: "2026-11-30" }, prev: OCT, currency: "NGN", side: "spend", by: "account" });
    expect(rows.map((r) => [r.key, r.minor, r.prevMinor])).toEqual([
      ["cash", 1_000, 80_000],
      ["bank", 0, 60_000],
    ]);
  });
});

describe("percentChange", () => {
  it("is a whole percent, or null with nothing before", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(1, 3)).toBe(-67);
  });
});

describe("heat scale", () => {
  it("cuts at the owner's own quartiles", () => {
    const t = heatThresholds([0, 100, 200, 300, 400, 500]);
    expect(t).toEqual([200, 300, 400]);
    expect([0, 100, 200, 250, 400, 500].map((v) => heatLevel(v, t))).toEqual([0, 1, 1, 2, 3, 4]);
    expect(heatThresholds([])).toEqual([0, 0, 0]);
  });
});

describe("currenciesIn", () => {
  it("puts the base currency first", () => {
    const txns = [txn("2026-11-01", -1, { currency: "USD" }), txn("2026-11-01", -1, { currency: "USD" }), txn("2026-11-02", -1)];
    expect(currenciesIn(txns, CATS, NOV, "NGN")).toEqual(["NGN", "USD"]);
    expect(currenciesIn(txns, CATS, OCT, "NGN")).toEqual([]);
  });
});

describe("accountBalance", () => {
  const account: Account = { id: "cash", slug: "cash", name: "Cash", kind: "cash", currency: "NGN", openingMinor: 1_000_000, archived: false };
  it("is opening + everything before the window + the window", () => {
    const txns = [
      txn("2026-11-02", -100_000),
      txn("2026-11-02", 50_000),
      txn("2026-11-02", -1, { accountId: "bank" }),
      // Older than the window: already in the server's prior sum, so not counted twice.
      txn("2026-08-01", -999_999),
    ];
    expect(accountBalance(account, -200_000, txns, "2026-09-01")).toBe(750_000);
  });
});
