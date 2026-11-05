import type { Currency } from "./currency";
import { addDays, addMonthsClamped, daysBetween, type Day } from "./dates";
import type { Txn } from "./money";
import type { SubCycle, Subscription } from "./subscriptions";

// Recurring-charge detection (FR-MONEY-11, SPEC T37). Money out to the same
// payee, the amount within 10 % and the gap within 3 days of a cadence, at
// least 3 times in a row, is suggested as a subscription. One click makes it
// one with `detectedFromTxn` (set by the server, V28). Pure.

export const MIN_HITS = 3;
const DAY_SLACK = 3;
/** ±10 %, as a fraction so the check stays in integers. */
const AMOUNT_SLACK = { num: 1, den: 10 };

const CADENCES: readonly { cycle: SubCycle; intervalCount: number }[] = [
  { cycle: "week", intervalCount: 1 },
  { cycle: "week", intervalCount: 2 },
  { cycle: "month", intervalCount: 1 },
  { cycle: "month", intervalCount: 3 },
  { cycle: "year", intervalCount: 1 },
];

/**
 * A payee as banks print it varies: "NETFLIX.COM 866-579-7172", "POS PURCHASE
 * NETFLIX.COM 4411". Lower case, without long digit runs, card masks and the
 * usual channel words, so the same merchant groups together.
 */
export function recurringPayee(payee: string): string {
  return payee
    .toLowerCase()
    .replace(/\b(pos|web|online|card|purchase|payment|debit|recurring|nip|transfer|trf|ussd)\b/g, " ")
    .replace(/[x*#]{2,}\d*/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^\p{L}\p{N}.&' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RecurringSuggestion {
  /** Stable for this payee and currency: a dismissed suggestion stays dismissed. */
  key: string;
  name: string;
  /** The latest charge, as a positive amount. */
  amountMinor: number;
  currency: Currency;
  cycle: SubCycle;
  intervalCount: number;
  /** The latest charge's day: the new subscription's anchor (V30). */
  lastOn: Day;
  /** The latest charge: the server checks it is the owner's before marking the subscription detected. */
  lastTxnId: string;
  accountId: string;
  categoryId: string | null;
  hits: number;
}

function step(on: Day, c: { cycle: SubCycle; intervalCount: number }): Day {
  switch (c.cycle) {
    case "day":
      return addDays(on, c.intervalCount);
    case "week":
      return addDays(on, 7 * c.intervalCount);
    case "month":
      return addMonthsClamped(on, c.intervalCount);
    case "year":
      return addMonthsClamped(on, 12 * c.intervalCount);
  }
}

const near = (a: number, b: number) => Math.abs(a - b) * AMOUNT_SLACK.den <= Math.abs(b) * AMOUNT_SLACK.num;

/** How many charges, counted back from the latest, follow the cadence and stay near the latest amount. */
function chainLength(sorted: readonly Txn[], c: { cycle: SubCycle; intervalCount: number }): number {
  const last = sorted.at(-1);
  if (!last) return 0;
  let n = 1;
  let later = last;
  for (let i = sorted.length - 2; i >= 0; i--) {
    const t = sorted[i];
    if (!t) break;
    // > 0: one cycle on from t lands before `later` (a cycle was missed); < 0: after it (t is too close).
    const gap = daysBetween(step(t.postedOn, c), later.postedOn);
    if (gap > DAY_SLACK) break;
    // Too close, or another amount on the right day: a one-off at the same shop, passed over.
    if (gap < -DAY_SLACK || !near(t.amountMinor, last.amountMinor)) continue;
    n++;
    later = t;
  }
  return n;
}

/**
 * Suggestions from the ledger, latest charge first. A payee that already has
 * a subscription (same name, or the same currency and an amount within 10 %
 * on the same account) is left out, and so is one charged last more than two
 * cycles ago: it has likely stopped.
 */
export function detectRecurring(txns: readonly Txn[], subs: readonly Subscription[], today: Day): RecurringSuggestion[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.amountMinor >= 0 || t.transferId !== null) continue;
    const payee = recurringPayee(t.payee);
    if (payee === "") continue;
    const key = `${t.currency}|${payee}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  const taken = new Set(subs.map((s) => recurringPayee(s.name)));
  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (list.length < MIN_HITS) continue;
    const sorted = [...list].sort((a, b) => (a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : a.createdAt - b.createdAt));
    const last = sorted.at(-1);
    if (!last) continue;
    let best: { c: (typeof CADENCES)[number]; hits: number } | null = null;
    for (const c of CADENCES) {
      const hits = chainLength(sorted, c);
      if (hits >= MIN_HITS && (!best || hits > best.hits)) best = { c, hits };
    }
    if (!best) continue;
    const stale = step(step(last.postedOn, best.c), best.c);
    if (daysBetween(stale, today) > DAY_SLACK) continue;
    const amount = -last.amountMinor;
    const payee = recurringPayee(last.payee);
    if (taken.has(payee)) continue;
    if (subs.some((s) => s.currency === last.currency && s.accountId === last.accountId && near(s.amountMinor, amount))) continue;
    out.push({
      key,
      name: prettyName(payee),
      amountMinor: amount,
      currency: last.currency,
      cycle: best.c.cycle,
      intervalCount: best.c.intervalCount,
      lastOn: last.postedOn,
      lastTxnId: last.id,
      accountId: last.accountId,
      categoryId: last.categoryId,
      hits: best.hits,
    });
  }
  return out.sort((a, b) => (a.lastOn < b.lastOn ? 1 : a.lastOn > b.lastOn ? -1 : a.key.localeCompare(b.key)));
}

/** "netflix.com" → "Netflix.com": a starting name the owner can edit. */
function prettyName(payee: string): string {
  return payee.replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase()).slice(0, 80);
}
