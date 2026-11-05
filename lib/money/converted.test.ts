import { describe, expect, it } from "vitest";
import { convertedNet, convertedTotals, inBase } from "./converted";
import { FxTable } from "./fx";
import { byId, type Category, type Txn } from "./money";

const categories = byId<Category>([
  { id: "food", slug: null, name: "Food", parentId: null, emoji: "", color: "slate", kind: "expense", archived: false },
  { id: "pay", slug: null, name: "Pay", parentId: null, emoji: "", color: "slate", kind: "income", archived: false },
]);
let n = 0;
const txn = (postedOn: string, amountMinor: number, currency: Txn["currency"], categoryId: string | null = null, transferId: string | null = null): Txn => ({
  id: `t${String(++n)}`,
  accountId: "a",
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
const table = new FxTable([
  { on: "2026-11-01", base: "USD", quote: "NGN", rate: "1500" },
  { on: "2026-11-03", base: "USD", quote: "NGN", rate: "1600" },
]);

describe("convertedTotals", () => {
  const txns = [
    txn("2026-11-02", -10_000, "NGN", "food"),
    txn("2026-11-02", -100, "USD", "food"), // ₦1,500
    txn("2026-11-04", -100, "USD", "food"), // ₦1,600
    txn("2026-11-04", -500, "GBP", "food"), // no rate
    txn("2026-11-04", 500_000, "NGN", "pay"),
    txn("2026-11-04", -9_999, "NGN", null, "x"), // transfer
    txn("2026-10-30", -100, "USD", "food"), // outside the range
  ];

  it("converts each entry at its day's rate, keeps unrated ones apart", () => {
    const c = convertedTotals(txns, categories, "2026-11-01", "2026-11-30", "NGN", table);
    expect(c.spend.total).toEqual({ minor: 10_000 + 150_000 + 160_000, currency: "NGN" });
    expect(c.spend.missing).toEqual([{ minor: 500, currency: "GBP" }]);
    expect(c.spend.originals).toEqual([
      { minor: 10_000, currency: "NGN" },
      { minor: 200, currency: "USD" },
      { minor: 500, currency: "GBP" },
    ]);
    expect(c.income.total.minor).toBe(500_000);
    expect(c.count).toBe(5);
    const net = convertedNet(c);
    expect(net.total.minor).toBe(500_000 - 320_000);
    expect(net.missing).toEqual([{ minor: -500, currency: "GBP" }]);
  });
});

describe("inBase", () => {
  it("rounds each entry once and lists what had no rate", () => {
    const out = inBase([txn("2026-11-02", -1, "USD"), txn("2026-11-02", -7, "NGN"), txn("2026-10-01", -3, "USD")], "NGN", table);
    expect(out.txns.map((t) => [t.amountMinor, t.currency])).toEqual([
      [-1500, "NGN"],
      [-7, "NGN"],
    ]);
    expect(out.left).toEqual([{ minor: -3, currency: "USD" }]);
  });
});
