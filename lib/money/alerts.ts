import "server-only";
import type { Notice } from "@/lib/notifications/notifications";
import { addNotices } from "@/lib/notifications/store";
import { budgetAlerts, budgetProgress } from "./budgets";
import { addMonths, startOfMonth, todayIn } from "./dates";
import { FxTable } from "./fx";
import { readRates } from "./fx-store";
import { byId } from "./money";
import { loadBudgetFacts } from "./plans-store";
import { loadAlertFacts } from "./store";
import { alertNotice, dueAlerts } from "./subscriptions";

// Money alerts (V31): subscription reminders and budget thresholds, checked
// when the owner's shell loads, after a subscription save (its reminders),
// and after a txn or budget save (budgets). No daily cron (T36 decision):
// with no push channel yet, an alert raised while no app is open would wait
// for the next load anyway, which runs this same check. The dedupe key makes
// every check after the first a no-op, on any device.

/**
 * Raises the reminders due today and returns their notices (new or already
 * there) for the centre to merge. `only`: one subscription, after a save.
 * Without it, budgets are checked too. Never throws: a failed check runs
 * again at the next load.
 */
export async function raiseMoneyAlerts(userId: string, only?: string): Promise<Notice[]> {
  const subs = (async () => {
    try {
      const facts = await loadAlertFacts(userId);
      if (!facts) return [];
      const list = only === undefined ? facts.subscriptions : facts.subscriptions.filter((s) => s.id === only);
      return await addNotices(userId, dueAlerts(list, facts.today).map(alertNotice));
    } catch (error) {
      console.error("raiseMoneyAlerts failed", error);
      return [];
    }
  })();
  if (only !== undefined) return subs;
  const [a, b] = await Promise.all([subs, raiseBudgetAlerts(userId)]);
  return [...a, ...b];
}

/**
 * Raises the 80 % and 100 % alerts this month's budgets have reached (V31)
 * and returns their notices. Converts with stored rates only: a save never
 * waits on the FX source. Never throws.
 */
export async function raiseBudgetAlerts(userId: string): Promise<Notice[]> {
  try {
    const facts = await loadBudgetFacts(userId);
    if (!facts || facts.budgets.length === 0) return [];
    const mixed = facts.txns.some((t) => facts.budgets.some((b) => b.currency !== t.currency));
    const rates = mixed ? ((await readRates(addMonths(startOfMonth(facts.today), -1), facts.today)) ?? []) : [];
    const table = new FxTable(rates);
    const categories = byId(facts.categories);
    const progress = facts.budgets.map((b) => budgetProgress(b, facts.txns, categories, facts.today, todayIn(facts.timeZone, new Date(b.createdAt)), table));
    return await addNotices(userId, budgetAlerts(progress, categories, facts.today));
  } catch (error) {
    console.error("raiseBudgetAlerts failed", error);
    return [];
  }
}
