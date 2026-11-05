import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { convertMinor, FxTable } from "./fx";
import { byId } from "./money";
import { applyRules } from "./rules";
import { DEMO_ACCOUNTS, demoBudgets, demoCategories, demoCategoryId, demoMoneyAlerts, demoRates, demoRules, demoSubscriptions, seedMoney } from "./seed";
import { alertKey, nextRenewal } from "./subscriptions";

// Demo mode's data (G4) must be self-consistent: every id it points at
// exists, every amount is a safe integer, and what it shows today is there.

const TODAY = "2026-11-05";

describe("demo seed", () => {
  it("names categories by slug, and refuses an unknown one", () => {
    const cats = byId(demoCategories());
    expect(cats.get(demoCategoryId("food"))?.slug).toBe("food");
    expect(() => demoCategoryId("nope")).toThrow();
  });

  it("puts every txn on a demo account, in that account's currency", () => {
    const accounts = byId(DEMO_ACCOUNTS);
    const payload = seedMoney(TODAY);
    for (const t of payload.txns) expect(accounts.get(t.accountId)?.currency, t.id).toBe(t.currency);
    expect(DEMO_ACCOUNTS.every((a) => Number.isSafeInteger(a.openingMinor))).toBe(true);
  });

  it("has subscriptions on demo accounts and categories, in every state", () => {
    const subs = demoSubscriptions(TODAY);
    const accounts = byId(DEMO_ACCOUNTS);
    const cats = byId(demoCategories());
    expect(new Set(subs.map((s) => s.id)).size).toBe(subs.length);
    for (const s of subs) {
      expect(s.accountId === null || accounts.get(s.accountId)?.currency === s.currency, s.name).toBe(true);
      expect(s.categoryId === null || cats.has(s.categoryId), s.name).toBe(true);
      expect(s.amountMinor > 0 && Number.isSafeInteger(s.amountMinor), s.name).toBe(true);
    }
    expect(new Set(subs.map((s) => s.status))).toEqual(new Set(["active", "paused", "cancelled"]));
    const gym = subs.find((s) => s.name === "Gym");
    expect(gym && nextRenewal(gym, TODAY)).toBe(addDays(TODAY, 2));
  });

  it("raises today's reminders: the gym in 2 days and the trial ending in 3", () => {
    const subs = byId(demoSubscriptions(TODAY));
    const keys = demoMoneyAlerts(TODAY).map((n) => n.dedupeKey);
    const gym = [...subs.values()].find((s) => s.name === "Gym");
    const trial = [...subs.values()].find((s) => s.name === "Design tool");
    expect(keys).toContain(alertKey(gym?.id ?? "", addDays(TODAY, 2), "renew"));
    expect(keys).toContain(alertKey(trial?.id ?? "", addDays(TODAY, 3), "trial"));
    // Nothing for the paused or cancelled ones.
    for (const s of subs.values()) if (s.status !== "active") expect(keys.some((k) => k.includes(s.id))).toBe(false);
  });

  it("has one overall budget and one per category, made before the window", () => {
    const budgets = demoBudgets(TODAY);
    const cats = byId(demoCategories());
    expect(budgets.filter((b) => b.categoryId === null)).toHaveLength(1);
    const targets = budgets.map((b) => b.categoryId);
    expect(new Set(targets).size).toBe(targets.length);
    expect(budgets.every((b) => b.categoryId === null || cats.has(b.categoryId))).toBe(true);
    expect(budgets.every((b) => b.createdAt < Date.parse(`${seedMoney(TODAY).since}T00:00:00Z`))).toBe(true);
  });

  it("has rules that file demo payees", () => {
    const rules = demoRules(TODAY);
    const filed = applyRules({ payee: "SHOPRITE Lekki", categoryId: null, tags: [] as string[] }, rules, () => true);
    expect(filed).toMatchObject({ categoryId: demoCategoryId("groceries"), tags: ["weekly"] });
  });

  it("converts every demo currency with its fixed rates, without a fetch", () => {
    const table = new FxTable(demoRates(TODAY));
    const payload = seedMoney(TODAY);
    for (const t of payload.txns) expect(convertMinor(t.amountMinor, t.currency, "NGN", t.postedOn, table), t.id).not.toBeNull();
    // $15.49 × 1,346.60127178 = ₦20,858.8537 → ₦20,858.85
    expect(convertMinor(1_549, "USD", "NGN", TODAY, table)).toBe(2_085_885);
  });
});
