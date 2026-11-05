import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb, type FakeQuery } from "@/lib/db/fake";

// Budget and rule persistence (T38): ownership checks, one budget per
// category, the two-devices race, and what the budget check loads. The SQL
// ran against Neon in the T39 owner check.

vi.mock("server-only", () => ({}));
let fake: FakeDb | null = null;
vi.mock("@/lib/db", () => ({ getDb: () => fake?.db ?? null }));

const { deleteBudget, deleteRule, loadBudgetFacts, loadRules, saveBudget, saveRule } = await import("./plans-store");

const USER = "user-1";
const AT = new Date("2026-11-01T10:00:00Z");
const BUDGET = { id: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a40", categoryId: "food", amountMinor: 18_000_000, currency: "NGN" as const, rollover: true };
const RIDES = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a60";
const RULE = { id: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a50", payeeContains: "uber", categoryId: RIDES, tags: ["work"], priority: 0, enabled: true };
const budgetRow = (over: Record<string, unknown> = {}) => ({ ...BUDGET, userId: USER, period: "month", createdAt: AT, updatedAt: AT, ...over });
const ruleRow = (over: Record<string, unknown> = {}) => ({
  id: RULE.id,
  userId: USER,
  match: { payeeContains: "uber" },
  action: { categoryId: RIDES, tags: ["work"] },
  priority: 0,
  enabled: true,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

function world(o: { owned?: boolean; clash?: boolean; upsert?: () => unknown }) {
  fake = fakeDb((q: FakeQuery) => {
    if (q.op === "select" && q.table === "category") return o.owned === false ? [] : [{ id: "food" }];
    if (q.op === "select" && q.table === "budget") return o.clash ? [{ id: "other" }] : [];
    if (q.op === "insert") return o.upsert ? o.upsert() : q.table === "budget" ? [budgetRow()] : [ruleRow()];
    return [];
  });
  return fake;
}

beforeEach(() => {
  fake = null;
});

describe("saveBudget", () => {
  it("is null without a database", async () => {
    expect(await saveBudget(USER, BUDGET)).toBeNull();
  });

  it("saves the owner's budget", async () => {
    const f = world({});
    expect(await saveBudget(USER, BUDGET)).toEqual({ kind: "saved", budget: { ...BUDGET, createdAt: AT.getTime() } });
    expect(f.queries.find((q) => q.op === "insert")?.values).toMatchObject({ id: BUDGET.id, userId: USER, categoryId: "food" });
  });

  it("refuses another owner's category, and writes nothing", async () => {
    const f = world({ owned: false });
    expect(await saveBudget(USER, BUDGET)).toEqual({ kind: "not-yours" });
    expect(f.queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("an overall budget needs no category check", async () => {
    world({ owned: false, upsert: () => [budgetRow({ categoryId: null })] });
    expect(await saveBudget(USER, { ...BUDGET, categoryId: null })).toMatchObject({ kind: "saved" });
  });

  it("refuses a second budget for the same category as taken", async () => {
    const f = world({ clash: true });
    expect(await saveBudget(USER, BUDGET)).toEqual({ kind: "taken" });
    expect(f.queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("two devices at once: the unique key's refusal is taken too, other errors throw", async () => {
    world({ upsert: () => {
      throw Object.assign(new Error("wrapped"), { cause: { code: "23505" } });
    } });
    expect(await saveBudget(USER, BUDGET)).toEqual({ kind: "taken" });
    world({ upsert: () => {
      throw new Error("down");
    } });
    await expect(saveBudget(USER, BUDGET)).rejects.toThrow("down");
  });

  it("an id owned by someone else updates nothing: not yours", async () => {
    world({ upsert: () => [] });
    expect(await saveBudget(USER, BUDGET)).toEqual({ kind: "not-yours" });
  });
});

describe("rules", () => {
  it("saves the owner's rule as match and action JSON", async () => {
    const f = world({});
    expect(await saveRule(USER, RULE)).toEqual({ kind: "saved", rule: { ...RULE, createdAt: AT.getTime() } });
    expect(f.queries.find((q) => q.op === "insert")?.values).toMatchObject({ match: { payeeContains: "uber" }, action: { categoryId: RIDES, tags: ["work"] } });
  });

  it("refuses another owner's category; a tags-only rule skips the check", async () => {
    world({ owned: false });
    expect(await saveRule(USER, RULE)).toEqual({ kind: "not-yours" });
    const f = world({ owned: false, upsert: () => [ruleRow({ action: { categoryId: null, tags: ["work"] } })] });
    expect(await saveRule(USER, { ...RULE, categoryId: null })).toMatchObject({ kind: "saved" });
    expect(f.queries.some((q) => q.table === "category")).toBe(false);
  });

  it("loads enabled rules, skips unreadable JSON, and is empty on a failed read", async () => {
    fake = fakeDb(() => [ruleRow(), ruleRow({ id: "bad", match: { nope: 1 } })]);
    expect((await loadRules(USER)).map((r) => r.id)).toEqual([RULE.id]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake = fakeDb(() => {
      throw new Error("down");
    });
    expect(await loadRules(USER)).toEqual([]);
    fake = null;
    expect(await loadRules(USER)).toEqual([]);
  });

  it("deletes only by the owner's id, null without a database", async () => {
    expect(await deleteRule(USER, RULE.id)).toBeNull();
    expect(await deleteBudget(USER, BUDGET.id)).toBeNull();
    const f = world({});
    expect(await deleteRule(USER, RULE.id)).toBe(true);
    expect(await deleteBudget(USER, BUDGET.id)).toBe(true);
    expect(f.queries.map((q) => `${q.op} ${q.table}`)).toEqual(["delete rule", "delete budget"]);
  });
});

describe("loadBudgetFacts (V31)", () => {
  it("reads nothing more when there are no budgets", async () => {
    const f = fakeDb((q) => (q.table === "user_prefs" ? [{ baseCurrency: "NGN", timeZone: "Africa/Lagos" }] : []));
    fake = f;
    expect(await loadBudgetFacts(USER, new Date("2026-11-05T23:30:00Z"))).toEqual({ today: "2026-11-06", timeZone: "Africa/Lagos", budgets: [], categories: [], txns: [] });
    expect(f.queries.map((q) => q.table)).toEqual(["user_prefs", "budget"]);
  });

  it("loads this month and last (for rollover) in the owner's zone", async () => {
    const f = fakeDb((q) => {
      if (q.table === "user_prefs") return [{ baseCurrency: "USD", timeZone: "America/New_York" }];
      if (q.table === "budget") return [budgetRow(), budgetRow({ id: "odd", period: "week" })];
      return [];
    });
    fake = f;
    // 03:30 UTC on 1 Nov is still 31 Oct in New York.
    const got = await loadBudgetFacts(USER, new Date("2026-11-01T03:30:00Z"));
    expect(got?.today).toBe("2026-10-31");
    expect(got?.budgets.map((b) => b.id)).toEqual([BUDGET.id]);
    expect(f.queries.map((q) => q.table)).toEqual(["user_prefs", "budget", "category", "txn"]);
  });
});
