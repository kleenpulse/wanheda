import { assertMinor, type Currency } from "./currency";
import { type Day } from "./dates";
import { flowOf, type Account, type Category, type Txn } from "./money";
import { daysOf, type Bucket } from "./periods";

// Report maths for the money views (FR-MONEY-5, 6). Every figure is a sum of
// integer minor units in ONE currency, checked to stay a safe integer (V25);
// nothing here converts or adds across currencies (V26). Percent changes are
// ratios shown to the reader, never money, and never feed back into a sum.

export type Side = "spend" | "income";

interface Range {
  from: Day;
  to: Day;
}

const inRange = (t: Pick<Txn, "postedOn">, r: Range) => t.postedOn >= r.from && t.postedOn <= r.to;

/** The amount a txn adds to a side, as a positive figure, or 0 when it counts on the other side (or none). */
export function sideAmount(t: Txn, categories: ReadonlyMap<string, Category>, side: Side): number {
  const flow = flowOf(t, categories);
  if (flow === "transfer" || flow !== side) return 0;
  // A refund in a spend category lowers spend, so the sign is kept (V25).
  return side === "spend" ? -t.amountMinor : t.amountMinor;
}

/** Currencies with spend or income in a range: the base one first, then by how often they appear. */
export function currenciesIn(txns: readonly Txn[], categories: ReadonlyMap<string, Category>, range: Range, base: Currency): Currency[] {
  const seen = new Map<Currency, number>();
  for (const t of txns) {
    if (!inRange(t, range) || flowOf(t, categories) === "transfer") continue;
    seen.set(t.currency, (seen.get(t.currency) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => Number(b[0] === base) - Number(a[0] === base) || b[1] - a[1]).map(([c]) => c);
}

/** One side's total per day in one currency. Days with nothing are absent. */
export function dailyTotals(
  txns: readonly Txn[],
  categories: ReadonlyMap<string, Category>,
  range: Range,
  currency: Currency,
  side: Side,
): Map<Day, number> {
  const out = new Map<Day, number>();
  for (const t of txns) {
    if (t.currency !== currency || !inRange(t, range)) continue;
    const amount = sideAmount(t, categories, side);
    if (amount !== 0) out.set(t.postedOn, assertMinor((out.get(t.postedOn) ?? 0) + amount));
  }
  return out;
}

export function sumDays(daily: ReadonlyMap<Day, number>, range: Range): number {
  let total = 0;
  for (const [day, minor] of daily) if (day >= range.from && day <= range.to) total = assertMinor(total + minor);
  return total;
}

export function bucketTotals(daily: ReadonlyMap<Day, number>, buckets: readonly Bucket[]): number[] {
  return buckets.map((b) => sumDays(daily, b));
}

/** Running total for each day of a range (the cumulative spend line). */
export function cumulative(daily: ReadonlyMap<Day, number>, from: Day, to: Day): number[] {
  let total = 0;
  return daysOf(from, to).map((d) => (total = assertMinor(total + (daily.get(d) ?? 0))));
}

/**
 * Change from `prev` to `cur` in whole percent, or null when there is
 * nothing to compare with (prev is 0). A ratio for the reader, not money.
 */
export function percentChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

/* -------------------------------------------------------------- breakdown */

export type GroupBy = "category" | "account" | "payee";

export interface BreakdownRow {
  /** Category id, account id, normalised payee, or NONE. */
  key: string;
  /** The payee as last written; the label for payee rows. */
  label: string;
  minor: number;
  prevMinor: number;
  count: number;
  /** Category rows only: the child categories under a parent that had any. */
  children: BreakdownRow[];
}

export const NONE = "";

/** A payee as the breakdown groups it: trimmed, spaces collapsed, lower case. */
export const normalPayee = (payee: string) => payee.trim().replace(/\s+/g, " ").toLowerCase();

function sortRows(rows: BreakdownRow[]): BreakdownRow[] {
  return rows.sort((a, b) => b.minor - a.minor || b.prevMinor - a.prevMinor || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/**
 * Totals of one side per category (children rolled into their parent and
 * listed under it), account or payee, for a range and the range it is
 * compared with. Rows that only had money in the earlier range are kept, so a
 * category that went to zero still shows its drop.
 */
export function breakdown(args: {
  txns: readonly Txn[];
  categories: ReadonlyMap<string, Category>;
  range: Range;
  prev: Range;
  currency: Currency;
  side: Side;
  by: GroupBy;
}): BreakdownRow[] {
  const { txns, categories, range, prev, currency, side, by } = args;
  const rows = new Map<string, BreakdownRow>();
  const row = (map: Map<string, BreakdownRow>, key: string, label: string) => {
    let r = map.get(key);
    if (!r) {
      r = { key, label, minor: 0, prevMinor: 0, count: 0, children: [] };
      map.set(key, r);
    }
    return r;
  };
  const children = new Map<string, Map<string, BreakdownRow>>();

  for (const t of txns) {
    if (t.currency !== currency) continue;
    const now = inRange(t, range);
    const before = inRange(t, prev);
    if (!now && !before) continue;
    const amount = sideAmount(t, categories, side);
    if (amount === 0) continue;

    const add = (r: BreakdownRow) => {
      if (now) {
        r.minor = assertMinor(r.minor + amount);
        r.count++;
      }
      if (before) r.prevMinor = assertMinor(r.prevMinor + amount);
    };

    if (by === "account") add(row(rows, t.accountId, ""));
    else if (by === "payee") {
      const key = normalPayee(t.payee);
      // txns come newest first, so the first spelling seen is the latest one.
      add(row(rows, key, t.payee.trim()));
    } else {
      const c = t.categoryId ? categories.get(t.categoryId) : undefined;
      const parentId = c?.parentId && categories.has(c.parentId) ? c.parentId : null;
      const top = parentId ?? c?.id ?? NONE;
      add(row(rows, top, ""));
      if (parentId && c) {
        let kids = children.get(parentId);
        if (!kids) children.set(parentId, (kids = new Map<string, BreakdownRow>()));
        add(row(kids, c.id, ""));
      }
    }
  }

  const out = sortRows([...rows.values()]);
  for (const r of out) {
    const kids = children.get(r.key);
    if (kids) r.children = sortRows([...kids.values()]);
  }
  return out;
}

/* ------------------------------------------------------------------- heat */

/**
 * Cut points for a four-step heat scale from the days that had any spend:
 * the 25th, 50th and 75th percentiles, so the steps follow the owner's own
 * spread rather than a fixed amount.
 */
export function heatThresholds(values: Iterable<number>): [number, number, number] {
  const xs = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (xs.length === 0) return [0, 0, 0];
  const at = (q: number) => xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))] ?? 0;
  return [at(0.25), at(0.5), at(0.75)];
}

/** 0 for nothing spent, 1–4 by the thresholds. */
export function heatLevel(value: number, [a, b, c]: readonly [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (value <= a) return 1;
  if (value <= b) return 2;
  if (value <= c) return 3;
  return 4;
}

/* --------------------------------------------------------------- balances */

/**
 * An account's balance: its opening balance, plus every txn before the loaded
 * window (summed by the server), plus the window's txns as this device sees
 * them, pending writes included. All in the account's own currency.
 */
export function accountBalance(account: Account, priorMinor: number, txns: readonly Txn[], since: Day): number {
  let total = assertMinor(account.openingMinor + priorMinor);
  for (const t of txns) {
    if (t.accountId === account.id && t.postedOn >= since) total = assertMinor(total + t.amountMinor);
  }
  return total;
}
