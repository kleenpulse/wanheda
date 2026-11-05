import { describe, expect, it } from "vitest";
import type { Notice } from "@/lib/notifications/notifications";
import { budgetAlertKey, type Budget } from "./budgets";
import type { Category } from "./money";
import { moneyAlertsFrom, shortDue } from "./money-alerts";
import { alertKey, blankSubscription, type Subscription } from "./subscriptions";

const TODAY = "2026-11-05";
let n = 0;
const notice = (dedupeKey: string, over: Partial<Notice> = {}): Notice => ({
  id: `n${String(++n)}`,
  kind: "money",
  title: "From the notice",
  body: null,
  href: null,
  dedupeKey,
  createdAt: n,
  readAt: null,
  ...over,
});
const sub = (id: string, over: Partial<Subscription> = {}): Subscription => ({ ...blankSubscription(TODAY, "NGN"), id, name: id, createdAt: 0, ...over });
const budget = (id: string, categoryId: string | null): Budget => ({ id, categoryId, amountMinor: 100_000, currency: "NGN", rollover: false, createdAt: 0 });
const food: Category = { id: "food", slug: "food", name: "Food & drink", parentId: null, emoji: "", color: "yellow", kind: "expense", archived: false };

describe("moneyAlertsFrom (V31)", () => {
  it("shows budget alerts of this month only, named from the cache", () => {
    const all = budget("b-all", null);
    const f = budget("b-food", "food");
    const notices = [
      notice(budgetAlertKey(all, TODAY, 80)),
      notice(budgetAlertKey(f, TODAY, 100)),
      notice(budgetAlertKey(f, "2026-10-31", 100)), // last month: gone
    ];
    const got = moneyAlertsFrom(notices, { budgets: [all, f], categories: [food] }, TODAY);
    expect(got.map((a) => (a.type === "budget" ? [a.name, a.level] : null))).toEqual([
      ["Food & drink", 100],
      ["Overall", 80],
    ]);
  });

  it("drops a deleted budget once the cache is loaded, keeps it before", () => {
    const f = budget("b-food", "food");
    const notices = [notice(budgetAlertKey(f, TODAY, 80))];
    expect(moneyAlertsFrom(notices, { budgets: [] }, TODAY)).toEqual([]);
    const before = moneyAlertsFrom(notices, {}, TODAY);
    expect(before.map((a) => (a.type === "budget" ? a.name : null))).toEqual(["From the notice"]);
  });

  it("puts renewals by date before budgets, and skips read and other kinds", () => {
    const a = sub("a");
    const b = sub("b");
    const notices = [
      notice(budgetAlertKey(budget("x", null), TODAY, 80)),
      notice(alertKey("b", "2026-11-09", "renew")),
      notice(alertKey("a", "2026-11-06", "trial")),
      notice(alertKey("a", "2026-11-07", "renew"), { readAt: 5 }),
      notice("timer:1", { kind: "timer" }),
      notice("not-a-key"),
    ];
    const got = moneyAlertsFrom(notices, { subscriptions: [a, b] }, TODAY);
    expect(got.map((x) => (x.type === "sub" ? `${x.sub?.id ?? ""} ${x.on} ${x.kind}` : "budget"))).toEqual(["a 2026-11-06 trial", "b 2026-11-09 renew", "budget"]);
  });

  it("keeps a reminder on its own day, drops it the day after", () => {
    const notices = [notice(alertKey("a", TODAY, "renew"))];
    expect(moneyAlertsFrom(notices, { subscriptions: [sub("a")] }, TODAY)).toHaveLength(1);
    expect(moneyAlertsFrom(notices, { subscriptions: [sub("a")] }, "2026-11-06")).toEqual([]);
    expect(moneyAlertsFrom(notices, { subscriptions: [sub("a", { status: "cancelled" })] }, TODAY)).toEqual([]);
  });
});

describe("shortDue", () => {
  it("is Today for today or past, else days", () => {
    expect(shortDue(TODAY, TODAY)).toBe("Today");
    expect(shortDue("2026-11-04", TODAY)).toBe("Today");
    expect(shortDue("2026-11-06", TODAY)).toBe("1d");
    expect(shortDue("2026-11-15", TODAY)).toBe("10d");
  });
});
