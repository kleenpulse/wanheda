import { sumByCurrency, type Currency, type Money } from "./currency";
import type { Day } from "./dates";
import { convertMinor, convertTotal, type Converted, type Dated, type FxTable } from "./fx";
import { flowOf, type Category, type Txn } from "./money";

// Reports in the base currency (FR-MONEY-14, SPEC V26). Headline totals are
// exact: every entry converted at its own day's rate, added as fractions,
// rounded once. Charts and breakdown rows need one whole number per entry, so
// there each entry is converted and rounded once on its own, then added.

export interface ConvertedTotals {
  spend: Converted;
  income: Converted;
  /** Entries counted on either side. */
  count: number;
}

/** Spend and income over [from, to] in `base`, with the originals and anything that had no rate. */
export function convertedTotals(
  txns: readonly Txn[],
  categories: ReadonlyMap<string, Category>,
  from: Day,
  to: Day,
  base: Currency,
  table: FxTable,
): ConvertedTotals {
  const spend: Dated[] = [];
  const income: Dated[] = [];
  for (const t of txns) {
    if (t.postedOn < from || t.postedOn > to) continue;
    const flow = flowOf(t, categories);
    if (flow === "transfer") continue;
    if (flow === "spend") spend.push({ minor: -t.amountMinor, currency: t.currency, on: t.postedOn });
    else income.push({ minor: t.amountMinor, currency: t.currency, on: t.postedOn });
  }
  return { spend: convertTotal(spend, base, table), income: convertTotal(income, base, table), count: spend.length + income.length };
}

/** Net = income − spend, both already in the same currency. Missing parts stay apart, signed. */
export function convertedNet(c: ConvertedTotals): Converted {
  const neg = (xs: readonly Money[]) => xs.map((m) => ({ ...m, minor: -m.minor }));
  const currency = c.income.total.currency;
  return {
    total: { minor: c.income.total.minor - c.spend.total.minor, currency },
    originals: sumByCurrency([...c.income.originals, ...neg(c.spend.originals)]),
    missing: sumByCurrency([...c.income.missing, ...neg(c.spend.missing)]),
  };
}

/**
 * Every entry as if it were entered in `base` (charts and breakdowns): its
 * amount converted at its day's rate and rounded once. Entries with no rate
 * are left out and counted in `left`, per currency, so the page can say so.
 */
export function inBase(txns: readonly Txn[], base: Currency, table: FxTable): { txns: Txn[]; left: Money[] } {
  const out: Txn[] = [];
  const left: Money[] = [];
  for (const t of txns) {
    if (t.currency === base) {
      out.push(t);
      continue;
    }
    const minor = convertMinor(t.amountMinor, t.currency, base, t.postedOn, table);
    if (minor === null || minor === 0) {
      if (minor === null) left.push({ minor: t.amountMinor, currency: t.currency });
      continue;
    }
    out.push({ ...t, amountMinor: minor, currency: base });
  }
  return { txns: out, left: sumByCurrency(left) };
}
