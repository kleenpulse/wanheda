import type { Notice } from "@/lib/notifications/notifications";
import { budgetName, parseBudgetAlertKey, type Budget } from "./budgets";
import { daysBetween, type Day } from "./dates";
import { byId, type Category } from "./money";
import { parseAlertKey, type SubEventKind, type Subscription } from "./subscriptions";

// The island's `money-alert` (V31), pure: derived from the same facts as the
// notification centre, the unread money notices, so the two never disagree.
// A subscription reminder stays until it is dismissed (marked read) or its
// day passes; a budget alert until it is dismissed or its month ends. When
// the money cache is on the device, a subscription since paused, cancelled or
// deleted drops out (as does a deleted budget), and the card can show more.

export type MoneyAlert =
  | { type: "sub"; notice: Notice; on: Day; kind: SubEventKind; sub: Subscription | undefined }
  | { type: "budget"; notice: Notice; month: string; level: 80 | 100; budget: Budget | undefined; name: string };

/** What the device's money cache holds, if anything (undefined = not loaded: alerts are kept as raised). */
export interface MoneyAlertCache {
  subscriptions?: readonly Subscription[] | undefined;
  budgets?: readonly Budget[] | undefined;
  categories?: readonly Category[] | undefined;
}

/** The live money alerts among `notices` on `today`: renewals by date first, then budgets (fullest first). */
export function moneyAlertsFrom(notices: readonly Notice[], cache: MoneyAlertCache, today: Day): MoneyAlert[] {
  const { subscriptions: subs, budgets } = cache;
  const cats: ReadonlyMap<string, Category> = byId(cache.categories ?? []);
  const out: MoneyAlert[] = [];
  for (const notice of notices) {
    if (notice.kind !== "money" || notice.readAt !== null) continue;
    const key = parseAlertKey(notice.dedupeKey);
    if (key) {
      if (key.on < today) continue;
      const sub = subs?.find((s) => s.id === key.subId);
      if (subs && (!sub || sub.status !== "active")) continue;
      out.push({ type: "sub", notice, on: key.on, kind: key.kind, sub });
      continue;
    }
    const b = parseBudgetAlertKey(notice.dedupeKey);
    if (!b || b.month !== today.slice(0, 7)) continue;
    const budget = budgets?.find((x) => (b.target === "all" ? x.categoryId === null : x.id === b.target));
    if (budgets && !budget) continue;
    out.push({ type: "budget", notice, month: b.month, level: b.level, budget, name: budget ? budgetName(budget, cats) : notice.title });
  }
  const at = (a: MoneyAlert) => (a.type === "sub" ? a.on : "9999");
  return out.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a.type === "budget" && b.type === "budget" ? b.level - a.level : 0));
}

/** "Today" or "3d": the one figure worth a glance on the island pill. */
export function shortDue(on: Day, today: Day): string {
  const n = daysBetween(today, on);
  return n <= 0 ? "Today" : `${String(n)}d`;
}
