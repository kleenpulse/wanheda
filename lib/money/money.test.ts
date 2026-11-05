import { describe, expect, it } from "vitest";
import { applyPending, byId, compareTxns, defaultAccount, flowOf, removeTxn, totals, txnWriteSchema, upsertTxn, type Txn } from "./money";
import { DEMO_ACCOUNTS, demoCategories, demoCategoryId, seedMoney } from "./seed";
import type { Account } from "./money";

const [cash, second] = DEMO_ACCOUNTS as [Account, Account, Account];

const cats = byId(demoCategories());
const T = (n: number, over: Partial<Txn>): Txn => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  accountId: cash.id,
  postedOn: "2026-11-05",
  amountMinor: -100,
  currency: "NGN",
  payee: "",
  categoryId: null,
  note: "",
  tags: [],
  source: "manual",
  transferId: null,
  createdAt: n,
  ...over,
});

describe("flowOf", () => {
  it("follows the category, then the sign; transfers count nowhere", () => {
    expect(flowOf(T(1, { categoryId: demoCategoryId("food") }), cats)).toBe("spend");
    expect(flowOf(T(1, { amountMinor: 500, categoryId: demoCategoryId("food") }), cats)).toBe("spend");
    expect(flowOf(T(1, { amountMinor: 500, categoryId: demoCategoryId("salary") }), cats)).toBe("income");
    expect(flowOf(T(1, { amountMinor: 500 }), cats)).toBe("income");
    expect(flowOf(T(1, { amountMinor: -500 }), cats)).toBe("spend");
    expect(flowOf(T(1, { transferId: "x" }), cats)).toBe("transfer");
    expect(flowOf(T(1, { categoryId: demoCategoryId("transfer") }), cats)).toBe("transfer");
  });
});

describe("totals", () => {
  it("matches a hand count, per currency, inside the range only", () => {
    const txns = [
      T(1, { amountMinor: -450_000, categoryId: demoCategoryId("food") }),
      T(2, { amountMinor: -120_000, categoryId: demoCategoryId("transport") }),
      T(3, { amountMinor: 50_000, categoryId: demoCategoryId("food") }), // a refund lowers Food
      T(4, { amountMinor: -1_549, currency: "USD", categoryId: demoCategoryId("subscriptions") }),
      T(5, { amountMinor: 5_000_000, categoryId: demoCategoryId("salary") }),
      T(6, { amountMinor: -9_999, transferId: "t1" }),
      T(7, { amountMinor: -777, postedOn: "2026-10-31" }),
    ];
    expect(totals(txns, cats, "2026-11-01", "2026-11-30")).toEqual({
      spend: [
        { minor: 520_000, currency: "NGN" },
        { minor: 1_549, currency: "USD" },
      ],
      income: [{ minor: 5_000_000, currency: "NGN" }],
      count: 5,
      spendCount: 4,
    });
  });
});

describe("txnWriteSchema", () => {
  const ok = {
    id: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10",
    accountId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11",
    postedOn: "2026-11-05",
    amountMinor: -450_000,
    payee: " jollof ",
    categoryId: null,
    note: "",
    tags: ["Work", "work"],
  };

  it("accepts a write and normalises it", () => {
    expect(txnWriteSchema.parse(ok)).toEqual({ ...ok, payee: "jollof", tags: ["work"] });
  });

  it("refuses floats, zero, bad days, a currency and owner fields", () => {
    for (const bad of [
      { ...ok, amountMinor: 4500.5 },
      { ...ok, amountMinor: 0 },
      { ...ok, amountMinor: 2 ** 53 },
      { ...ok, amountMinor: "450000" },
      { ...ok, postedOn: "2026-02-30" },
      { ...ok, currency: "USD" },
      { ...ok, userId: "someone" },
    ]) {
      expect(txnWriteSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("cache helpers", () => {
  it("orders newest first and upserts by id", () => {
    const p = { ...seedMoney("2026-11-05"), txns: [T(1, { postedOn: "2026-11-04" }), T(2, {})] };
    p.txns.sort(compareTxns);
    expect(p.txns.map((t) => t.createdAt)).toEqual([2, 1]);
    const next = upsertTxn(p, T(1, { postedOn: "2026-11-06", amountMinor: -5 }));
    expect(next.txns.map((t) => [t.createdAt, t.amountMinor])).toEqual([
      [1, -5],
      [2, -100],
    ]);
    expect(removeTxn(next, T(1, {}).id).txns).toHaveLength(1);
  });

  it("lays unconfirmed writes over the server's rows", () => {
    const p = { ...seedMoney("2026-11-05"), txns: [T(1, {}), T(2, {})] };
    expect(applyPending(p, {})).toBe(p);
    const next = applyPending(p, { [T(1, {}).id]: null, [T(3, {}).id]: T(3, { postedOn: "2026-11-06" }) });
    expect(next.txns.map((t) => t.createdAt)).toEqual([3, 2]);
    expect(p.txns).toHaveLength(2);
  });

  it("defaults to the last used open account", () => {
    expect(defaultAccount(DEMO_ACCOUNTS, second.id)?.id).toBe(second.id);
    expect(defaultAccount(DEMO_ACCOUNTS.map((x) => (x.id === second.id ? { ...x, archived: true } : x)), second.id)?.id).toBe(cash.id);
    expect(defaultAccount([], null)).toBeNull();
  });
});

describe("seedMoney", () => {
  it("is stable for a day, in range, newest first, with valid ids", () => {
    const a = seedMoney("2026-11-05");
    expect(seedMoney("2026-11-05")).toEqual(a);
    expect(a.since).toBe("2026-09-01");
    expect(a.txns.length).toBeGreaterThan(100);
    expect(a.txns.every((t) => t.postedOn >= a.since && t.postedOn <= "2026-11-05")).toBe(true);
    expect([...a.txns].sort(compareTxns)).toEqual(a.txns);
    expect(a.txns.every((t) => Number.isSafeInteger(t.amountMinor) && t.amountMinor !== 0)).toBe(true);
    expect(new Set(a.txns.map((t) => t.id)).size).toBe(a.txns.length);
    for (const t of a.txns.slice(0, 5)) expect(txnWriteSchema.shape.id.safeParse(t.id).success).toBe(true);
    const known = byId(a.categories);
    expect(a.txns.every((t) => t.categoryId === null || known.has(t.categoryId))).toBe(true);
    expect(a.categories.every((c) => c.parentId === null || known.get(c.parentId)?.parentId === null)).toBe(true);
  });
});
