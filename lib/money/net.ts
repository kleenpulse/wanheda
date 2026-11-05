import type { Currency } from "./currency";
import { addMonths, endOfMonth, startOfMonth, type Day } from "./dates";
import { convertedNet, convertedTotals } from "./converted";
import { convertTotal, type Converted, type FxTable } from "./fx";
import type { Account, Category, Txn } from "./money";
import { accountBalance } from "./reports";

// The net view (T43, FR-INCOME-1), pure: income − spending per month from the
// ledger, in the base currency (V26). Income is ledger income only: SaaS
// revenue is shown beside it and never added, because a Polar payout lands in
// a bank account as a ledger entry and would count twice (user 2026-11-05).

export interface NetMonth {
  /** YYYY-MM in the owner's zone. */
  month: string;
  from: Day;
  to: Day;
  income: Converted;
  spend: Converted;
  net: Converted;
  /** net ÷ income, null with no income (shown `—`). */
  savingsRate: number | null;
  /** True for the month `today` is in: its figures are so far. */
  partial: boolean;
}

/** The `count` calendar months ending with today's, oldest first. */
export function monthsTo(today: Day, count: number): { month: string; from: Day; to: Day }[] {
  const first = addMonths(startOfMonth(today), -(count - 1));
  return Array.from({ length: count }, (_, i) => {
    const from = addMonths(first, i);
    return { month: from.slice(0, 7), from, to: endOfMonth(from) };
  });
}

export function netByMonth(
  txns: readonly Txn[],
  categories: ReadonlyMap<string, Category>,
  months: readonly { month: string; from: Day; to: Day }[],
  base: Currency,
  table: FxTable,
  today: Day,
): NetMonth[] {
  return months.map(({ month, from, to }) => {
    const totals = convertedTotals(txns, categories, from, to < today ? to : today, base, table);
    const net = convertedNet(totals);
    const income = totals.income.total.minor;
    return { month, from, to, income: totals.income, spend: totals.spend, net, savingsRate: income > 0 ? net.total.minor / income : null, partial: to >= today };
  });
}

/** Every open account's balance today, converted to `base` at today's rate; anything with no rate stays apart. */
export function cashIn(
  accounts: readonly Account[],
  /** Balances before the loaded window, per account (absent = 0). */
  priorMinor: Readonly<Record<string, number>> | undefined,
  txns: readonly Txn[],
  since: Day,
  base: Currency,
  table: FxTable,
  today: Day,
): Converted {
  return convertTotal(
    accounts.filter((a) => !a.archived).map((a) => ({ minor: accountBalance(a, priorMinor?.[a.id] ?? 0, txns, since), currency: a.currency, on: today })),
    base,
    table,
  );
}

/**
 * Runway in months: cash ÷ average monthly spending over the last three full
 * months that have any entry. Spending, not net burn: how long the cash lasts
 * if income stopped. A month with no entries at all (before the ledger began,
 * or not loaded) is left out rather than counted as nothing spent, which would
 * stretch the runway. Null with no spending to divide by; 0 with no cash.
 */
export function runwayMonths(cashMinor: number, months: readonly NetMonth[]): number | null {
  const last = months.filter((m) => !m.partial && (m.spend.total.minor !== 0 || m.income.total.minor !== 0)).slice(-3);
  if (last.length === 0) return null;
  const avg = last.reduce((s, m) => s + m.spend.total.minor, 0) / last.length;
  if (avg <= 0) return null;
  return Math.max(0, cashMinor) / avg;
}
