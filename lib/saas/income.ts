import { isCurrency, type Currency } from "@/lib/money/currency";
import type { Product } from "./connectors";
import type { Goal } from "./goals";
import { metrics, type Metrics, type MovementKind, type RevenueLine } from "./mrr";

// The income dashboard's read model (T42), pure: what /api/income sends, and
// the folds the /income views and widgets draw from it. Every figure is one
// currency's integers (V25): a scope is a product (or every product) in one
// currency, never a sum across currencies. Months are UTC, like movements.

export const INCOME_KEY = ["income"] as const;

export interface IncomeProduct extends Product {
  archived: boolean;
}

/** One mrr_movement row on the wire. */
export interface IncomeMovement {
  productId: string;
  /** ISO time. */
  occurredAt: string;
  customerRef: string;
  kind: MovementKind;
  deltaMrrMinor: number;
  currency: string;
}

/** Paid orders and succeeded refunds of one product in one UTC month and currency (refunds ≤ 0, never part of MRR: V36). */
export interface RevenueMonth {
  productId: string;
  /** YYYY-MM */
  month: string;
  currency: string;
  ordersMinor: number;
  refundsMinor: number;
}

/** One metric_snapshot row on the wire. */
export interface IncomeSnapshot {
  /** Null = every product of the organization. */
  productId: string | null;
  onDate: string;
  source: "polar" | "computed";
  currency: string;
  mrrMinor: number;
  /** Computed: paying customers. Polar: active subscriptions (V36). */
  customers: number;
  arpaMinor: number | null;
  /** Computed only: MRR in other currencies was left out of this row (`extra.byCurrency`). */
  otherCurrencies: boolean;
}

export interface IncomePayload {
  source: "owner" | "demo" | "load-failed";
  /** Connectors can be used (seal key and database present). */
  available: boolean;
  connectors: number;
  /** Live products, and archived ones that still have history. */
  products: IncomeProduct[];
  movements: IncomeMovement[];
  revenue: RevenueMonth[];
  /** The last 30 days of metric_snapshot, both sources. */
  snapshots: IncomeSnapshot[];
  /** MRR and savings goals (T43). */
  goals: Goal[];
}

export const EMPTY_INCOME: Omit<IncomePayload, "source"> = { available: false, connectors: 0, products: [], movements: [], revenue: [], snapshots: [], goals: [] };

/** Anything to show: MRR movements or paid orders. One-time sales alone still count (review FIX, T42). */
export function hasIncome(payload: Pick<IncomePayload, "movements" | "revenue">): boolean {
  return payload.movements.length > 0 || payload.revenue.length > 0;
}

/** The movement facts the engine's metrics() reads. */
export interface Facts {
  productId: string;
  occurredAt: Date;
  customerRef: string;
  kind: MovementKind;
  deltaMrrMinor: number;
  currency: Currency;
}

/**
 * Wire movements as engine facts. A currency Wanheda can't format is set
 * aside and counted, never shown as another currency's money.
 */
export function toFacts(movements: readonly IncomeMovement[]): { facts: Facts[]; unknown: string[] } {
  const facts: Facts[] = [];
  const unknown = new Set<string>();
  for (const m of movements) {
    if (!isCurrency(m.currency)) {
      unknown.add(m.currency);
      continue;
    }
    facts.push({ ...m, occurredAt: new Date(m.occurredAt), currency: m.currency });
  }
  return { facts, unknown: [...unknown].sort() };
}

/** Folds paid orders and refunds into months per product and currency. Currencies Wanheda can't format are dropped. */
export function revenueByMonth(lines: readonly RevenueLine[]): RevenueMonth[] {
  const rows = new Map<string, RevenueMonth>();
  for (const l of lines) {
    if (!isCurrency(l.currency)) continue;
    const month = l.at.toISOString().slice(0, 7);
    const key = `${l.productId}|${month}|${l.currency}`;
    const row = rows.get(key) ?? { productId: l.productId, month, currency: l.currency, ordersMinor: 0, refundsMinor: 0 };
    if (l.kind === "order") row.ordersMinor += l.amountMinor;
    else row.refundsMinor += l.amountMinor;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.productId < b.productId ? -1 : 1));
}

/** The movements of one product, or of every product when null. */
export function inProduct<T extends { productId: string }>(rows: readonly T[], productId: string | null): T[] {
  return productId === null ? [...rows] : rows.filter((r) => r.productId === productId);
}

/**
 * The currencies a scope has movements in, the one holding the most MRR now
 * first (ties by code), so the default view is the main one.
 */
export function currenciesOf(facts: readonly Facts[], now: Date): Currency[] {
  const mrr = new Map<Currency, number>();
  for (const f of facts) {
    if (!mrr.has(f.currency)) mrr.set(f.currency, 0);
    if (f.occurredAt.getTime() <= now.getTime()) mrr.set(f.currency, (mrr.get(f.currency) ?? 0) + f.deltaMrrMinor);
  }
  return [...mrr.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
}

/**
 * Every currency a scope can be viewed in: those with MRR first (most MRR
 * now first), then those with revenue only, by code (review FIX, T42: a
 * one-time-purchase product, or orders in a currency without MRR, must still
 * be reachable). Each is viewed alone, never summed (V25).
 */
export function scopeCurrencies(facts: readonly Facts[], revenue: readonly RevenueMonth[], now: Date): Currency[] {
  const out = currenciesOf(facts, now);
  const seen = new Set<string>(out);
  const extra = [...new Set(revenue.map((r) => r.currency))].filter((c): c is Currency => isCurrency(c) && !seen.has(c)).sort();
  return [...out, ...extra];
}

/** The first instant of a UTC month. */
export function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

export function monthOf(t: Date): string {
  return t.toISOString().slice(0, 7);
}

export function addMonth(month: string, n: number): string {
  const d = monthStart(month);
  d.setUTCMonth(d.getUTCMonth() + n);
  return monthOf(d);
}

/** Months from `first` to `last`, both included, oldest first. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  for (let m = first; m <= last && out.length < 1200; m = addMonth(m, 1)) out.push(m);
  return out;
}

export interface MonthRow {
  month: string;
  /** MRR at the start of the month (end of the one before). */
  startMrr: number;
  /** MRR at the month's end, or now for this month. */
  mrr: number;
  customers: number;
  byKind: Record<MovementKind, number>;
  /** Σ movements in the month = mrr − startMrr. */
  net: number;
  /** True for the month `now` is in: its figures are so far. */
  partial: boolean;
}

/**
 * One row per month: MRR and paying customers at its end (or now), and its
 * movements by kind. Pass one currency's facts (V25).
 */
export function monthlyRows(facts: readonly Facts[], months: readonly string[], now: Date): MonthRow[] {
  return months.map((month) => {
    const from = new Date(monthStart(month).getTime() - 1);
    const nextStart = monthStart(addMonth(month, 1)).getTime();
    const partial = now.getTime() < nextStart;
    const to = partial ? now : new Date(nextStart - 1);
    const m = metrics(facts, from, to);
    return { month, startMrr: m.mrr - m.netNew, mrr: m.mrr, customers: m.customers, byKind: m.byKind, net: m.netNew, partial };
  });
}

export const RANGES = ["6m", "12m", "all"] as const;
export type IncomeRange = (typeof RANGES)[number];

/** The months a range shows, ending with `now`'s month. "all" starts at the first movement or paid month, whichever is earlier. */
export function rangeMonths(range: IncomeRange, facts: readonly Facts[], now: Date, revenue: readonly RevenueMonth[] = []): string[] {
  const last = monthOf(now);
  if (range === "all") {
    const firstMovement = facts.reduce<Date | null>((min, f) => (min === null || f.occurredAt < min ? f.occurredAt : min), null);
    const candidates = [firstMovement ? monthOf(firstMovement) : last, ...revenue.map((r) => r.month)].filter((m) => m <= last);
    return monthRange(candidates.reduce((a, b) => (b < a ? b : a), last), last);
  }
  return monthRange(addMonth(last, range === "6m" ? -5 : -11), last);
}

export interface Headline {
  /** V36 metrics over the last 30 days: MRR, customers and ARPA now; churn and LTV over the 30 days. */
  trailing: Metrics;
  /** Net new MRR this month so far, and last month whole. */
  thisMonth: number;
  lastMonth: number;
  /** This month's movements so far, by kind. */
  thisMonthByKind: Record<MovementKind, number>;
}

const DAY_MS = 86_400_000;

export function headline(facts: readonly Facts[], now: Date): Headline {
  const trailing = metrics(facts, new Date(now.getTime() - 30 * DAY_MS), now);
  const month = monthOf(now);
  const start = monthStart(month).getTime();
  const lastStart = monthStart(addMonth(month, -1)).getTime();
  const current = metrics(facts, new Date(start - 1), now);
  return {
    trailing,
    thisMonth: current.netNew,
    lastMonth: metrics(facts, new Date(lastStart - 1), new Date(start - 1)).netNew,
    thisMonthByKind: current.byKind,
  };
}

/** Revenue per product over the months given, one currency, biggest net first. */
export function revenueByProduct(rows: readonly RevenueMonth[], months: ReadonlySet<string>, currency: string): { productId: string; ordersMinor: number; refundsMinor: number; netMinor: number }[] {
  const by = new Map<string, { productId: string; ordersMinor: number; refundsMinor: number; netMinor: number }>();
  for (const r of rows) {
    if (r.currency !== currency || !months.has(r.month)) continue;
    const row = by.get(r.productId) ?? { productId: r.productId, ordersMinor: 0, refundsMinor: 0, netMinor: 0 };
    row.ordersMinor += r.ordersMinor;
    row.refundsMinor += r.refundsMinor;
    row.netMinor += r.ordersMinor + r.refundsMinor;
    by.set(r.productId, row);
  }
  return [...by.values()].sort((a, b) => b.netMinor - a.netMinor || (a.productId < b.productId ? -1 : 1));
}

/** Net revenue per month for one scope and currency, in the months' order. */
export function revenueByMonthFor(rows: readonly RevenueMonth[], months: readonly string[], productId: string | null, currency: string): number[] {
  const by = new Map<string, number>();
  for (const r of inProduct(rows, productId)) {
    if (r.currency !== currency) continue;
    by.set(r.month, (by.get(r.month) ?? 0) + r.ordersMinor + r.refundsMinor);
  }
  return months.map((m) => by.get(m) ?? 0);
}

// Parity (V36): our computed figures beside Polar's own, per product and day.

export type ParityState =
  /** Within 1 minor unit per active subscription. */
  | "match"
  /** Off by more: marked, never hidden. */
  | "off"
  /** Our row is in another currency, or left other currencies out: Polar converts to USD, so the two can't be compared. */
  | "currency"
  | "no-polar"
  | "no-computed";

export interface ParityDay {
  onDate: string;
  computed: IncomeSnapshot | null;
  polar: IncomeSnapshot | null;
  state: ParityState;
  /** Polar − ours, in USD minor units, when comparable. */
  diffMinor: number | null;
  /** 1 minor unit per active subscription (Polar's count). */
  toleranceMinor: number | null;
}

export interface ProductParity {
  productId: string;
  /** Newest first. */
  days: ParityDay[];
  /** The newest day both sides have, else the newest day at all. */
  latest: ParityDay | null;
  offDays: number;
}

export function parityDay(onDate: string, computed: IncomeSnapshot | null, polar: IncomeSnapshot | null): ParityDay {
  const base = { onDate, computed, polar, diffMinor: null, toleranceMinor: null };
  if (!polar) return { ...base, state: "no-polar" };
  if (!computed) return { ...base, state: "no-computed" };
  if (computed.currency !== polar.currency || computed.otherCurrencies) return { ...base, state: "currency" };
  const diffMinor = polar.mrrMinor - computed.mrrMinor;
  const toleranceMinor = Math.max(0, polar.customers);
  return { ...base, diffMinor, toleranceMinor, state: Math.abs(diffMinor) > toleranceMinor ? "off" : "match" };
}

/**
 * Parity per product (V36). Read per product only: Polar's organization-wide
 * figures include products that aren't mapped, so the overall row is never
 * compared.
 */
export function parity(snapshots: readonly IncomeSnapshot[], productIds: readonly string[]): ProductParity[] {
  return productIds.map((productId) => {
    const days = new Map<string, { computed: IncomeSnapshot | null; polar: IncomeSnapshot | null }>();
    for (const s of snapshots) {
      if (s.productId !== productId) continue;
      const day = days.get(s.onDate) ?? { computed: null, polar: null };
      day[s.source] = s;
      days.set(s.onDate, day);
    }
    const list = [...days.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([onDate, d]) => parityDay(onDate, d.computed, d.polar));
    const both = list.find((d) => d.computed && d.polar);
    return { productId, days: list, latest: both ?? list[0] ?? null, offDays: list.filter((d) => d.state === "off").length };
  });
}
