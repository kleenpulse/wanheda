import { addRatio, roundHalfEven, ZERO, type Ratio } from "./convert";
import { assertMinor, CURRENCY_CODES, exponentOf, isCurrency, sumByCurrency, type Currency, type Money } from "./currency";
import { isDay, type Day } from "./dates";

/*
  Foreign exchange (FR-MONEY-14, SPEC V26). Rates come once a day from the
  fawazahmed0 currency API (decided 2026-11-05: free, no key, NGN included,
  history by date from 2024-03-02), all quoted against USD, and land in
  `fx_rate` as decimal strings in the direction that is ≥ 1 (USD→NGN, but
  EUR→USD), so 8 decimal places keep enough figures. Conversion reads them as
  exact fractions: a figure is converted at its own day's rate (or the latest
  earlier one), every part is added exactly, and the total is rounded once.
  A figure with no rate on or before its day is never guessed: it is reported
  apart, in its own currency.
*/

/** One stored rate: 1 `base` = `rate` `quote`, with rate ≥ 1 (V26). */
export interface FxRate {
  on: Day;
  base: Currency;
  quote: Currency;
  rate: string;
}

/** What the client caches under FX_KEY (`GET /api/money/fx`). */
export interface FxPayload {
  /** The first day asked for. Rates before it are the latest one per currency only. */
  from: Day;
  rates: FxRate[];
  /** Some days in the range are still being fetched: ask again shortly. */
  incomplete: boolean;
}

export const FX_KEY = "money-fx";
export const FX_PIVOT: Currency = "USD";
/** The source's first day with history; nothing before it is ever fetched. */
export const FX_HISTORY_START: Day = "2024-03-02";
const RATE_DP = 8;
/** `numeric(18, 8)`: at most 10 digits before the point. */
const RATE_MAX = 1e10;

/** "1346.60127178" → an exact fraction, or null for anything that isn't a positive decimal. */
export function parseRate(text: string): Ratio | null {
  const m = /^(\d{1,10})(?:\.(\d{1,8}))?$/.exec(text);
  if (!m?.[1]) return null;
  const frac = m[2] ?? "";
  const num = BigInt(m[1] + frac);
  if (num === 0n) return null;
  return { num, den: 10n ** BigInt(frac.length) };
}

function fixed(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0 || n >= RATE_MAX) return null;
  const text = n.toFixed(RATE_DP);
  return parseRate(text) ? text : null;
}

/**
 * The source's USD table (`{ "ngn": 1346.6, "eur": 0.888, … }`) as stored
 * rows for the currencies this build knows. The source sends JSON numbers;
 * each is written as an 8-place decimal string once, here, and only read as
 * an exact fraction after that. Below 1, the row is turned around (EUR→USD).
 */
export function ratesFromTable(on: Day, table: Readonly<Record<string, unknown>>): FxRate[] {
  if (!isDay(on)) return [];
  const out: FxRate[] = [];
  for (const code of CURRENCY_CODES) {
    if (code === FX_PIVOT) continue;
    const v = table[code.toLowerCase()];
    if (typeof v !== "number") continue;
    const rate = v >= 1 ? fixed(v) : fixed(1 / v);
    if (rate === null) continue;
    out.push(v >= 1 ? { on, base: FX_PIVOT, quote: code, rate } : { on, base: code, quote: FX_PIVOT, rate });
  }
  return out;
}

/** Units of `currency` (major) that one USD buys, as a fraction. */
function perUsd(r: FxRate): { currency: Currency; value: Ratio } | null {
  const q = parseRate(r.rate);
  if (!q) return null;
  if (r.base === FX_PIVOT && r.quote !== FX_PIVOT) return { currency: r.quote, value: q };
  if (r.quote === FX_PIVOT && r.base !== FX_PIVOT) return { currency: r.base, value: { num: q.den, den: q.num } };
  return null;
}

/**
 * Rates ready for lookups: per currency, its days in order, each with what
 * one USD buys. Built once per rate list; lookups are a binary search.
 */
export class FxTable {
  readonly #days = new Map<Currency, Day[]>();
  readonly #values = new Map<Currency, Ratio[]>();

  constructor(rates: readonly FxRate[]) {
    const byCurrency = new Map<Currency, Map<Day, Ratio>>();
    for (const r of rates) {
      const p = perUsd(r);
      if (!p || !isDay(r.on)) continue;
      let days = byCurrency.get(p.currency);
      if (!days) byCurrency.set(p.currency, (days = new Map<Day, Ratio>()));
      days.set(r.on, p.value);
    }
    for (const [currency, days] of byCurrency) {
      const sorted = [...days.keys()].sort();
      this.#days.set(currency, sorted);
      this.#values.set(
        currency,
        sorted.map((d) => days.get(d) ?? ZERO),
      );
    }
  }

  get empty(): boolean {
    return this.#days.size === 0;
  }

  /** What one USD bought in `currency` on `day`, or the latest day before it; null when there is none. */
  perUsd(currency: Currency, day: Day): Ratio | null {
    if (currency === FX_PIVOT) return { num: 1n, den: 1n };
    const days = this.#days.get(currency);
    const values = this.#values.get(currency);
    if (!days || !values) return null;
    let lo = 0;
    let hi = days.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((days[mid] ?? "") <= day) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? null : (values[found] ?? null);
  }

  /** The newest day any rate is for, or null. */
  latestDay(): Day | null {
    let latest: Day | null = null;
    for (const days of this.#days.values()) {
      const d = days.at(-1);
      if (d && (latest === null || d > latest)) latest = d;
    }
    return latest;
  }
}

/**
 * `minor` of `from`, on `day`, in minor units of `to`, exactly; null when
 * either side has no rate on or before that day (V26: never guessed).
 */
export function convertExact(minor: number, from: Currency, to: Currency, day: Day, table: FxTable): Ratio | null {
  assertMinor(minor);
  if (from === to) return { num: BigInt(minor), den: 1n };
  const a = table.perUsd(from, day);
  const b = table.perUsd(to, day);
  if (!a || !b) return null;
  // minor_to = minor_from ÷ 10^e_from × (to per USD ÷ from per USD) × 10^e_to
  const eFrom = 10n ** BigInt(exponentOf(from));
  const eTo = 10n ** BigInt(exponentOf(to));
  const num = BigInt(minor) * b.num * a.den * eTo;
  const den = b.den * a.num * eFrom;
  return addRatio(ZERO, { num, den });
}

/** One figure converted and rounded (half-even) on its own, or null with no rate. */
export function convertMinor(minor: number, from: Currency, to: Currency, day: Day, table: FxTable): number | null {
  const r = convertExact(minor, from, to, day, table);
  return r ? roundHalfEven(r) : null;
}

/** An amount on a day: a txn's, for conversion. */
export interface Dated {
  minor: number;
  currency: Currency;
  on: Day;
}

/** A total in one currency made from figures in several (V26). */
export interface Converted {
  /** Everything that could be converted, added exactly and rounded once. */
  total: Money;
  /** What went in, per currency, as entered: shown beside a converted total. */
  originals: Money[];
  /** Per currency, what had no rate on or before its day: left out of `total`, shown apart. */
  missing: Money[];
}

/** Adds dated amounts in `to` (V26): exact parts, one rounding, unconvertible ones apart. */
export function convertTotal(items: Iterable<Dated>, to: Currency, table: FxTable): Converted {
  let total = ZERO;
  const originals: Money[] = [];
  const missing: Money[] = [];
  for (const it of items) {
    originals.push({ minor: it.minor, currency: it.currency });
    const r = convertExact(it.minor, it.currency, to, it.on, table);
    if (r) total = addRatio(total, r);
    else missing.push({ minor: it.minor, currency: it.currency });
  }
  return { total: { minor: roundHalfEven(total), currency: to }, originals: sumByCurrency(originals), missing: sumByCurrency(missing) };
}

/** True when a converted total came from more than its own currency. */
export function isMixed(c: Converted): boolean {
  return c.originals.some((m) => m.currency !== c.total.currency);
}

/** Rows read back from the database: anything malformed is dropped, never guessed. */
export function cleanRates(rows: Iterable<{ on: unknown; base: unknown; quote: unknown; rate: unknown }>): FxRate[] {
  const out: FxRate[] = [];
  for (const r of rows) {
    if (!isDay(r.on) || !isCurrency(r.base) || !isCurrency(r.quote) || typeof r.rate !== "string") continue;
    // numeric(18, 8) reads back with trailing zeros; parseRate takes them as they are.
    if (!parseRate(r.rate)) continue;
    out.push({ on: r.on, base: r.base, quote: r.quote, rate: r.rate });
  }
  return out;
}
