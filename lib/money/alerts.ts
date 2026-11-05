import "server-only";
import type { Notice } from "@/lib/notifications/notifications";
import { addNotices } from "@/lib/notifications/store";
import { loadAlertFacts } from "./store";
import { alertNotice, dueAlerts } from "./subscriptions";

// Subscription reminders (V31), checked when the owner's shell loads and
// after a subscription is saved. No daily cron (T36 decision): with no push
// channel yet, a reminder raised while no app is open would wait for the next
// load anyway, which runs this same check. The dedupe key makes every check
// after the first a no-op, on any device.

/**
 * Raises the reminders due today and returns their notices (new or already
 * there) for the centre to merge. `only`: one subscription, after a save.
 * Never throws: a failed check runs again at the next load.
 */
export async function raiseMoneyAlerts(userId: string, only?: string): Promise<Notice[]> {
  try {
    const facts = await loadAlertFacts(userId);
    if (!facts) return [];
    const subs = only === undefined ? facts.subscriptions : facts.subscriptions.filter((s) => s.id === only);
    return await addNotices(userId, dueAlerts(subs, facts.today).map(alertNotice));
  } catch (error) {
    console.error("raiseMoneyAlerts failed", error);
    return [];
  }
}
