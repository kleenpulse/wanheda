import { roundHalfEven, scale } from "@/lib/money/convert";
import { mrrAt, type Movement } from "./mrr";
import type { PolarMetricDay } from "./polar/client";

// metric_snapshot rows (SPEC V36), pure: our computed figures and Polar's own,
// for the same UTC days, so the dashboard can show parity side by side.

export const SNAPSHOT_DAYS = 30;

export interface SnapshotRow {
  productId: string | null;
  onDate: string;
  source: "polar" | "computed";
  currency: string;
  mrrMinor: number;
  customers: number;
  arpaMinor: number | null;
  extra: Record<string, unknown>;
}

const DAY_MS = 86_400_000;

/** The last `count` UTC days up to and including `today`, oldest first. */
export function snapshotDays(today: Date, count = SNAPSHOT_DAYS): string[] {
  const end = Math.floor(today.getTime() / DAY_MS) * DAY_MS;
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

const endOfDay = (day: string) => new Date(`${day}T23:59:59.999Z`);

/**
 * Our figures per day for one scope (a product, or null = every product).
 * The row's currency is the one holding the most MRR on the last day; MRR in
 * any other currency is listed in `extra.byCurrency`, never added in (V25).
 */
export function computedSnapshots(movements: readonly Movement[], productId: string | null, days: readonly string[]): SnapshotRow[] {
  const byCurrency = new Map<string, Movement[]>();
  for (const m of movements) {
    const list = byCurrency.get(m.currency);
    if (list) list.push(m);
    else byCurrency.set(m.currency, [m]);
  }
  const last = days.at(-1);
  const ranked = [...byCurrency.entries()]
    .map(([currency, list]) => ({ currency, list, mrr: last ? mrrAt(list, endOfDay(last)).mrr : 0 }))
    .sort((a, b) => b.mrr - a.mrr || (a.currency < b.currency ? -1 : 1));
  const main = ranked[0];
  return days.map((day) => {
    if (!main) return { productId, onDate: day, source: "computed", currency: "USD", mrrMinor: 0, customers: 0, arpaMinor: null, extra: {} };
    const at = mrrAt(main.list, endOfDay(day));
    const customers = at.customers.size;
    const others = Object.fromEntries(ranked.slice(1).map((r) => [r.currency, mrrAt(r.list, endOfDay(day)).mrr]));
    return {
      productId,
      onDate: day,
      source: "computed",
      currency: main.currency,
      mrrMinor: at.mrr,
      customers,
      arpaMinor: customers > 0 ? roundHalfEven(scale(at.mrr, 1, customers)) : null,
      extra: ranked.length > 1 ? { byCurrency: others } : {},
    };
  });
}

/**
 * Polar's figures as rows. Polar reports USD cents and counts subscriptions,
 * not customers: `customers` holds active subscriptions, and the raw figures
 * stay in `extra`.
 */
export function polarSnapshots(days: readonly PolarMetricDay[], productId: string | null): SnapshotRow[] {
  return days.map((d) => {
    const int = (slug: string) => {
      const v = d.values[slug];
      return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
    };
    return {
      productId,
      onDate: d.day,
      source: "polar",
      currency: "USD",
      mrrMinor: int("monthly_recurring_revenue") ?? 0,
      customers: int("active_subscriptions") ?? 0,
      arpaMinor: int("average_revenue_per_user"),
      extra: d.values,
    };
  });
}
