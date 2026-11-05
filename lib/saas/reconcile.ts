import "server-only";
import { latestSnapshots } from "./polar/events";
import { loadEvents } from "./store";

// The one writer of derived income rows (FRD 4.5, SPEC V34). The webhook
// (push), the manual sync (pull) and a rebuild all call it, it reads the whole
// billing_event log of one connector and derives from that, so running it
// twice, or after events arrived out of order, gives the same result.
//
// T40 folds the log into the latest state of every subscription, order and
// refund. T41 turns that into mrr_movement rows (one transaction per product)
// and raises the income alerts (V37).

export interface ReconcileSummary {
  events: number;
  subscriptions: number;
  orders: number;
  refunds: number;
}

export async function reconcile(connectorId: string): Promise<ReconcileSummary | null> {
  const events = await loadEvents(connectorId);
  if (!events) return null;
  return {
    events: events.length,
    subscriptions: latestSnapshots(events, "subscription").size,
    orders: latestSnapshots(events, "order").size,
    refunds: latestSnapshots(events, "refund").size,
  };
}
