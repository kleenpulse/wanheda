import "server-only";
import type { Notice } from "@/lib/notifications/notifications";
import { addNotices } from "@/lib/notifications/store";
import { budgetAlerts, budgetProgress } from "./budgets";
import { addMonths, startOfMonth, todayIn } from "./dates";
import { FxTable } from "./fx";
import { ensureRates, readRates } from "./fx-store";
import { byId } from "./money";
import { loadBudgetFacts } from "./plans-store";
import { loadAlertFacts } from "./store";
import { alertNotice, dueAlerts } from "./subscriptions";

// Money alerts (V31): subscription reminders and budget thresholds. No daily
// cron (T36 decision): with no push channel yet, an alert raised while no app
// is open would wait for the next load anyway, which runs the same check.
// The dedupe key makes every check after the first a no-op, on any device.
//
// Where they run (review nits, PR #21): subscription reminders beside the
// shell's own reads, so they show in that load; the budget check after the
// shell's reply (`after()`), fetching FX first when spend is in several
// currencies; after a txn or budget save, inline (the alert comes back with
// the save) on stored rates, with a refresh after the reply when they may be
// stale.

/**
 * Raises the subscription reminders due today and returns their notices (new
 * or already there) for the centre to merge. `only`: one subscription, after
 * a save. Never throws: a failed check runs again at the next load.
 */
export async function raiseMoneyAlerts(userId: string, only?: string): Promise<Notice[]> {
  try {
    const facts = await loadAlertFacts(userId);
    if (!facts) return [];
    const list = only === undefined ? facts.subscriptions : facts.subscriptions.filter((s) => s.id === only);
    return await addNotices(userId, dueAlerts(list, facts.today).map(alertNotice));
  } catch (error) {
    console.error("raiseMoneyAlerts failed", error);
    return [];
  }
}

export interface BudgetCheck {
  notices: Notice[];
  /** Spend is in several currencies and rates were not refreshed: run again with `fetchRates` after the reply. */
  stale: boolean;
}

/**
 * Raises the 80 % and 100 % alerts this month's budgets have reached (V31)
 * and returns their notices. `fetchRates`: fill missing FX days (last month
 * on) before converting; without it, stored rates only, so a save never waits
 * on the FX source. Never throws.
 */
export async function raiseBudgetAlerts(userId: string, options: { fetchRates?: boolean } = {}): Promise<BudgetCheck> {
  try {
    const facts = await loadBudgetFacts(userId);
    if (!facts || facts.budgets.length === 0) return { notices: [], stale: false };
    const from = addMonths(startOfMonth(facts.today), -1);
    const mixed = facts.txns.some((t) => facts.budgets.some((b) => b.currency !== t.currency));
    if (mixed && options.fetchRates) await ensureRates(from, facts.today);
    const rates = mixed ? ((await readRates(from, facts.today)) ?? []) : [];
    const table = new FxTable(rates);
    const categories = byId(facts.categories);
    const progress = facts.budgets.map((b) => budgetProgress(b, facts.txns, categories, facts.today, todayIn(facts.timeZone, new Date(b.createdAt)), table));
    const notices = await addNotices(userId, budgetAlerts(progress, categories, facts.today));
    return { notices, stale: mixed && !options.fetchRates };
  } catch (error) {
    console.error("raiseBudgetAlerts failed", error);
    return { notices: [], stale: false };
  }
}

/** The budget check for a save: inline on stored rates, and again after the reply when they may be stale. */
export async function budgetAlertsForSave(userId: string, later: (run: () => Promise<unknown>) => void): Promise<Notice[]> {
  const check = await raiseBudgetAlerts(userId);
  if (check.stale) {
    later(() => raiseBudgetAlerts(userId, { fetchRates: true }));
  }
  return check.notices;
}
