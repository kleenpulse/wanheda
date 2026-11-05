import { describe, expect, it } from "vitest";
import { FxTable } from "./fx";
import { byId, type Account, type Category, type Txn } from "./money";
import { cashIn, monthsTo, netByMonth, runwayMonths } from "./net";

const categories = byId<Category>([
  { id: "food", slug: null, name: "Food", parentId: null, emoji: "", color: "slate", kind: "expense", archived: false },
  { id: "pay", slug: null, name: "Pay", parentId: null, emoji: "", color: "slate", kind: "income", archived: false },
]);
let n = 0;
const txn = (postedOn: string, amountMinor: number, currency: Txn["currency"], categoryId: string | null, accountId = "a", transferId: string | null = null): Txn => ({
  id: `t${String(++n)}`,
  accountId,
  postedOn,
  amountMinor,
  currency,
  payee: "",
  categoryId,
  note: "",
  tags: [],
  source: "manual",
  transferId,
  createdAt: n,
});
const table = new FxTable([{ on: "2026-08-01", base: "USD", quote: "NGN", rate: "1500" }]);
const TODAY = "2026-11-05";

describe("monthsTo", () => {
  it("ends with today's month, whole calendar months", () => {
    expect(monthsTo(TODAY, 3)).toEqual([
      { month: "2026-09", from: "2026-09-01", to: "2026-09-30" },
      { month: "2026-10", from: "2026-10-01", to: "2026-10-31" },
      { month: "2026-11", from: "2026-11-01", to: "2026-11-30" },
    ]);
  });
});

describe("netByMonth", () => {
  const txns = [
    txn("2026-10-01", 1_000_000, "NGN", "pay"),
    txn("2026-10-02", -400_000, "NGN", "food"),
    txn("2026-10-03", -100, "USD", "food"), // ₦1,500
    txn("2026-10-04", -50_000, "NGN", null, "a", "x"), // transfer: neither side
    txn("2026-11-02", -20_000, "NGN", "food"),
    txn("2026-11-30", -99_999, "NGN", "food"), // after today: not yet
  ];
  const rows = netByMonth(txns, categories, monthsTo(TODAY, 2), "NGN", table, TODAY);

  it("is ledger income − spending in the base currency, transfers left out", () => {
    expect(rows[0]).toMatchObject({ month: "2026-10", partial: false });
    expect(rows[0]?.income.total.minor).toBe(1_000_000);
    expect(rows[0]?.spend.total.minor).toBe(400_000 + 150_000);
    expect(rows[0]?.net.total.minor).toBe(450_000);
    expect(rows[0]?.savingsRate).toBeCloseTo(0.45);
  });

  it("counts this month only up to today, and has no savings rate without income", () => {
    expect(rows[1]).toMatchObject({ month: "2026-11", partial: true, savingsRate: null });
    expect(rows[1]?.spend.total.minor).toBe(20_000);
  });
});

describe("runwayMonths", () => {
  const month = (minor: number, partial = false, income = 0) =>
    ({ spend: { total: { minor, currency: "NGN" } }, income: { total: { minor: income, currency: "NGN" } }, partial }) as unknown as Parameters<typeof runwayMonths>[1][number];

  it("divides cash by the average spending of the last 3 full months, ignoring this month", () => {
    expect(runwayMonths(600_000, [month(999), month(100_000), month(200_000), month(300_000), month(5_000_000, true)])).toBe(3);
  });

  it("leaves out months with no entries at all (before the ledger began), not counting them as nothing spent", () => {
    expect(runwayMonths(600_000, [month(0), month(0), month(200_000), month(400_000), month(1, true)])).toBe(2);
    // A month with only income still counts: nothing was spent in it.
    expect(runwayMonths(600_000, [month(0, false, 5), month(200_000), month(400_000)])).toBe(3);
  });

  it("is null with nothing spent, 0 with no cash", () => {
    expect(runwayMonths(600_000, [month(0, false, 9), month(0, false, 9)])).toBeNull();
    expect(runwayMonths(600_000, [])).toBeNull();
    expect(runwayMonths(-10, [month(100)])).toBe(0);
  });
});

describe("cashIn", () => {
  const accounts: Account[] = [
    { id: "a", slug: null, name: "Bank", kind: "bank", currency: "NGN", openingMinor: 100_000, archived: false },
    { id: "b", slug: null, name: "Card", kind: "bank", currency: "USD", openingMinor: 1_000, archived: false },
    { id: "c", slug: null, name: "Old", kind: "bank", currency: "NGN", openingMinor: 999_999, archived: true },
    { id: "d", slug: null, name: "Pounds", kind: "bank", currency: "GBP", openingMinor: 500, archived: false },
  ];
  it("adds open balances converted at today's rate; archived left out, unrated kept apart", () => {
    const txns = [txn("2026-11-02", -20_000, "NGN", "food", "a")];
    const cash = cashIn(accounts, { a: 50_000 }, txns, "2026-09-01", "NGN", table, TODAY);
    // a: 100k opening + 50k before the window − 20k; b: $10 = ₦15,000.
    expect(cash.total).toEqual({ minor: 130_000 + 1_500_000, currency: "NGN" });
    expect(cash.missing).toEqual([{ minor: 500, currency: "GBP" }]);
  });
});
