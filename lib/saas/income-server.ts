import "server-only";
import type { Owner } from "@/lib/auth/owner";
import { connectorSealKey, has } from "@/lib/capabilities";
import { EMPTY_INCOME, revenueByMonth, type IncomePayload, type IncomeSnapshot } from "./income";
import { movementsFrom, revenueFrom, type Movement } from "./mrr";
import { DEMO_PRODUCT_MAP, DEMO_PRODUCTS, demoBillingEvents, demoGoals } from "./seed";
import { computedSnapshots, snapshotDays, SNAPSHOT_DAYS } from "./snapshots";
import { loadIncome } from "./store";

// The income dashboard's read (T42). The owner's comes from mrr_movement,
// metric_snapshot and the order/refund log; demo's is built from the seed log
// through the same engine and never touches the database (G4).

const DAY_MS = 86_400_000;

export async function incomeFor(owner: Owner, now = new Date()): Promise<IncomePayload> {
  if (owner.kind === "demo") return demoIncome(now);
  const available = has("connectors") && connectorSealKey() !== null;
  const since = new Date(now.getTime() - (SNAPSHOT_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  let loaded;
  try {
    loaded = await loadIncome(owner.user.id, since);
  } catch {
    return { source: "load-failed", ...EMPTY_INCOME };
  }
  if (!loaded) return { source: "owner", ...EMPTY_INCOME };
  const known = new Set(loaded.products.map((p) => p.id));
  const lines = loaded.connectors.flatMap((c) => {
    const map = new Map(Object.entries(c.config.productMap).filter(([, id]) => known.has(id)));
    return revenueFrom(loaded.revenueEvents.get(c.id) ?? [], map);
  });
  return {
    source: "owner",
    available,
    connectors: loaded.connectors.length,
    products: loaded.products,
    movements: loaded.movements,
    revenue: revenueByMonth(lines),
    snapshots: loaded.snapshots,
    goals: loaded.goals,
  };
}

const wire = (m: Movement) => ({
  productId: m.productId,
  occurredAt: m.occurredAt.toISOString(),
  customerRef: m.customerRef,
  kind: m.kind,
  deltaMrrMinor: m.deltaMrrMinor,
  currency: m.currency,
});

/** The sample "Polar" day that is off, so the demo shows how a mismatch is marked (V36). */
const DEMO_OFF_DAYS_AGO = 6;
const DEMO_OFF_MINOR = 1_200;

/**
 * Demo income: the seed log through the engine, our snapshots for the last
 * 30 days, and Polar's side mirrored from them (one subscription per demo
 * customer) with one day of one product off, labelled as sample on screen.
 */
export function demoIncome(now: Date): IncomePayload {
  const events = demoBillingEvents(now);
  const movements = movementsFrom(events, { productMap: DEMO_PRODUCT_MAP, asOf: now });
  const days = snapshotDays(now);
  const offDay = days.at(-1 - DEMO_OFF_DAYS_AGO);
  const snapshots: IncomeSnapshot[] = DEMO_PRODUCTS.flatMap((p, i) =>
    computedSnapshots(
      movements.filter((m) => m.productId === p.id),
      p.id,
      days,
    ).flatMap(({ extra: _extra, ...row }) => {
      const computed: IncomeSnapshot = { ...row, otherCurrencies: false };
      const off = i === 1 && row.onDate === offDay ? DEMO_OFF_MINOR : 0;
      return [computed, { ...computed, source: "polar" as const, mrrMinor: row.mrrMinor + off }];
    }),
  );
  return {
    source: "demo",
    available: false,
    connectors: 0,
    products: DEMO_PRODUCTS.map((p) => ({ ...p, archived: false })),
    movements: movements.map(wire),
    revenue: revenueByMonth(revenueFrom(events, DEMO_PRODUCT_MAP)),
    snapshots,
    goals: demoGoals(now),
  };
}
