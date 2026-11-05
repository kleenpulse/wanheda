import "server-only";
import { addNotices } from "@/lib/notifications/store";
import { incomeAlerts } from "./alerts";
import { movementsFrom, type EngineEvent, type Movement } from "./mrr";
import { latestSnapshots } from "./polar/events";
import { computedSnapshots, snapshotDays } from "./snapshots";
import { countEvents, loadEvents, loadReconcileFacts, writeDerived, type ReconcileFacts } from "./store";

// The one writer of derived income rows (FRD 4.5, SPEC V34, V35). The webhook
// (push), the manual sync (pull) and a rebuild all call it. It reads the whole
// billing_event log of one connector and derives everything from that, so
// running it twice, or after events arrived out of order, gives the same rows.
//
// Steps: mrr_movement rebuilt and our computed metric_snapshot rows (last 30
// days) upserted in one locked transaction; then the income alerts (V37),
// deduped by key. The overall (product null) snapshot is this connector's
// products: right while one Polar organization is the only connector (T45
// must merge them).
//
// Polar sends webhooks in bursts, so runs overlap (review, T41). The write
// takes a per-connector lock, so two runs never interleave; and a run that
// read the log before a newer event landed may still write last. So after its
// write a run counts the log again: if it grew, it runs again with the newer
// log, and the last writer always holds the newest one.

export interface ReconcileSummary {
  events: number;
  subscriptions: number;
  movements: number;
}

const MAX_RUNS = 3;

interface Derived {
  facts: ReconcileFacts;
  events: EngineEvent[];
  productMap: Map<string, string>;
  movements: Movement[];
}

async function deriveAndWrite(connectorId: string, now: Date): Promise<Derived | null> {
  const [facts, events] = await Promise.all([loadReconcileFacts(connectorId), loadEvents(connectorId)]);
  if (!facts || !events) return null;
  const known = new Set(facts.products.map((p) => p.id));
  // A mapping onto a product that no longer exists is ignored; archived ones keep their history.
  const productMap = new Map(Object.entries(facts.config.productMap).filter(([, id]) => known.has(id)));
  const movements = movementsFrom(events, { productMap, asOf: now });

  const mapped = new Set(productMap.values());
  const live = facts.products.filter((p) => !p.archived && mapped.has(p.id));
  const liveIds = new Set(live.map((p) => p.id));
  const days = snapshotDays(now);
  const snapshots = [
    ...live.flatMap((p) => computedSnapshots(movements.filter((m) => m.productId === p.id), p.id, days)),
    ...computedSnapshots(movements.filter((m) => liveIds.has(m.productId)), null, days),
  ];
  await writeDerived(connectorId, facts.userId, movements, snapshots);
  return { facts, events, productMap, movements };
}

export async function reconcile(connectorId: string, now = new Date()): Promise<ReconcileSummary | null> {
  let last: Derived | null = null;
  for (let run = 1; run <= MAX_RUNS; run++) {
    try {
      last = await deriveAndWrite(connectorId, now);
    } catch (error) {
      // A concurrent run's write can still fail this one (e.g. a unique key): read the log again.
      if (run === MAX_RUNS) throw error;
      continue;
    }
    if (!last) return null;
    const count = await countEvents(connectorId);
    if (count === null || count === last.events.length) break;
  }
  if (!last) return null;

  const { facts, events, productMap, movements } = last;
  const archived = new Set(facts.products.filter((p) => p.archived).map((p) => p.id));
  await addNotices(
    facts.userId,
    incomeAlerts({
      movements: movements.filter((m) => !archived.has(m.productId)),
      events,
      productMap: new Map([...productMap].filter(([, id]) => !archived.has(id))),
      productNames: new Map(facts.products.map((p) => [p.id, p.name])),
      now,
    }),
  );
  return { events: events.length, subscriptions: latestSnapshots(events, "subscription").size, movements: movements.length };
}
