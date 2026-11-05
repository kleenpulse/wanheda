import { describe, expect, it } from "vitest";
import { budgetAlertKey, budgetAlerts, budgetProgress, budgetWriteSchema, levelOf, parseBudgetAlertKey, sortBudgets, type Budget } from "./budgets";
import { FxTable } from "./fx";
import { byId, type Category, type Txn } from "./money";

const cat = (id: string, kind: Category["kind"], parentId: string | null = null, name = id): Category => ({
  id,
  slug: null,
  name,
  parentId,
  emoji: "",
  color: "slate",
  kind,
  archived: false,
});
const categories = byId([cat("food", "expense", null, "Food"), cat("out", "expense", "food", "Eating out"), cat("fuel", "expense"), cat("salary", "income"), cat("move", "transfer")]);

let n = 0;
const txn = (postedOn: string, amountMinor: number, categoryId: string | null, currency: Txn["currency"] = "NGN"): Txn => ({
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
  transferId: null,
  createdAt: n,
});

const budget = (over: Partial<Budget> = {}): Budget => ({ id: "b1", categoryId: "food", amountMinor: 100_000, currency: "NGN", rollover: false, createdAt: 0, ...over });
const none = new FxTable([]);

describe("levelOf", () => {
  it("80 at four fifths, 100 at the limit, on the integers", () => {
    expect(levelOf(79_999, 100_000)).toBe(0);
    expect(levelOf(80_000, 100_000)).toBe(80);
    expect(levelOf(99_999, 100_000)).toBe(80);
    expect(levelOf(100_000, 100_000)).toBe(100);
    expect(levelOf(1, 0)).toBe(100);
    expect(levelOf(0, -5)).toBe(0);
  });
});

describe("budgetProgress", () => {
  const txns = [
    txn("2026-11-02", -30_000, "food"),
    txn("2026-11-03", -25_000, "out"), // a child counts
    txn("2026-11-04", 5_000, "food"), // a refund lowers it
    txn("2026-11-04", -40_000, "fuel"),
    txn("2026-11-05", 900_000, "salary"),
    txn("2026-11-05", -70_000, "move"), // transfers never count
    txn("2026-10-30", -99_000, "food"), // last month
  ];

  it("counts the category and its children, refunds lower it", () => {
    const p = budgetProgress(budget(), txns, categories, "2026-11-15", "2026-11-01", none);
    expect(p.spent).toEqual({ minor: 50_000, currency: "NGN" });
    expect(p.limit.minor).toBe(100_000);
    expect(p.carry).toBeNull();
    expect(p.level).toBe(0);
    expect(p.share).toBe(0.5);
  });

  it("overall counts every spend, never income or transfers", () => {
    const p = budgetProgress(budget({ categoryId: null }), txns, categories, "2026-11-15", "2026-11-01", none);
    expect(p.spent.minor).toBe(90_000);
  });

  it("rollover carries last month's leftover or overspend, only once it existed then", () => {
    const p = budgetProgress(budget({ rollover: true }), txns, categories, "2026-11-15", "2026-09-20", none);
    expect(p.carry).toEqual({ minor: 1_000, currency: "NGN" });
    expect(p.limit.minor).toBe(101_000);
    const over = budgetProgress(budget({ rollover: true, amountMinor: 60_000 }), txns, categories, "2026-11-15", "2026-09-20", none);
    expect(over.carry?.minor).toBe(-39_000);
    expect(over.limit.minor).toBe(21_000);
    expect(over.level).toBe(100);
    // Made this month: nothing to carry.
    expect(budgetProgress(budget({ rollover: true }), txns, categories, "2026-11-15", "2026-11-02", none).carry).toBeNull();
  });

  it("converts other currencies at each day's rate, keeps unrated ones apart", () => {
    const table = new FxTable([{ on: "2026-11-01", base: "USD", quote: "NGN", rate: "1500" }]);
    const mixed = [txn("2026-11-02", -1_000, "food", "USD"), txn("2026-11-02", -500, "food", "GBP"), txn("2026-11-02", -10_000, "food")];
    const p = budgetProgress(budget(), mixed, categories, "2026-11-15", "2026-11-01", table);
    expect(p.spent.minor).toBe(1_500_000 + 10_000);
    expect(p.missing).toEqual([{ minor: 500, currency: "GBP" }]);
    expect(p.level).toBe(100);
  });
});

describe("alerts", () => {
  it("raises only the highest level reached, keyed once a month (V31)", () => {
    const b = budget();
    const at = (spent: number) => budgetProgress(b, [txn("2026-11-02", -spent, "food")], categories, "2026-11-15", "2026-11-01", none);
    expect(budgetAlerts([at(10_000)], categories, "2026-11-15")).toEqual([]);
    const eighty = budgetAlerts([at(85_000)], categories, "2026-11-15");
    expect(eighty.map((a) => a.dedupeKey)).toEqual(["budget:b1:2026-11:80"]);
    expect(eighty[0]?.title).toBe("Food budget at 80 %");
    const full = budgetAlerts([at(120_000)], categories, "2026-11-15");
    expect(full.map((a) => a.dedupeKey)).toEqual(["budget:b1:2026-11:100"]);
    // No amounts in the text (V25, V31).
    expect(`${full[0]?.title ?? ""} ${full[0]?.body ?? ""}`).not.toMatch(/\d{3}|₦/);
  });

  it("the overall budget's key says all", () => {
    expect(budgetAlertKey({ id: "x", categoryId: null }, "2026-11-30", 100)).toBe("budget:all:2026-11:100");
    expect(parseBudgetAlertKey("budget:all:2026-11:100")).toEqual({ target: "all", month: "2026-11", level: 100 });
    expect(parseBudgetAlertKey("budget:b1:2026-11:80")).toEqual({ target: "b1", month: "2026-11", level: 80 });
    expect(parseBudgetAlertKey("budget:b1:2026-11:90")).toBeNull();
    expect(parseBudgetAlertKey("sub:x:2026-11-01:renew")).toBeNull();
  });
});

describe("budgetWriteSchema", () => {
  it("takes a positive whole amount and refuses extra keys", () => {
    const ok = { id: crypto.randomUUID(), categoryId: null, amountMinor: 5_000, currency: "NGN", rollover: false };
    expect(budgetWriteSchema.safeParse(ok).success).toBe(true);
    expect(budgetWriteSchema.safeParse({ ...ok, amountMinor: 0 }).success).toBe(false);
    expect(budgetWriteSchema.safeParse({ ...ok, amountMinor: 1.5 }).success).toBe(false);
    expect(budgetWriteSchema.safeParse({ ...ok, currency: "XXX" }).success).toBe(false);
    expect(budgetWriteSchema.safeParse({ ...ok, userId: "u" }).success).toBe(false);
  });
});

describe("sortBudgets", () => {
  it("overall first, then by category name", () => {
    const list = [budget({ id: "f", categoryId: "fuel" }), budget({ id: "o", categoryId: null }), budget({ id: "e", categoryId: "out" })];
    expect(sortBudgets(list, categories).map((b) => b.id)).toEqual(["o", "e", "f"]);
  });
});
