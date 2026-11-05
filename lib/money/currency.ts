// Money as integers (SPEC V10, V25). An amount is a whole number of the
// currency's minor unit (kobo, cents) plus its ISO 4217 code. Amounts are
// parsed from digit strings, added as integers, and every result is checked to
// be a safe integer, so nothing is ever rounded without anyone saying so.
// Multiplying and dividing money happens only in lib/money/convert.ts (V26).

/** ISO 4217 codes Wanheda knows, with their minor-unit exponent. */
export const CURRENCIES = {
  NGN: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
  CAD: 2,
  GHS: 2,
  KES: 2,
  ZAR: 2,
  JPY: 0,
} as const satisfies Record<string, number>;

export type Currency = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export interface Money {
  /** Minor units: a safe integer. < 0 is money out, > 0 is money in. */
  minor: number;
  currency: Currency;
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

export function exponentOf(currency: Currency): number {
  return CURRENCIES[currency];
}

export class MoneyError extends Error {
  override name = "MoneyError";
}

/** Throws unless `minor` is a safe integer. Every boundary calls this (V25). */
export function assertMinor(minor: number): number {
  if (!Number.isSafeInteger(minor)) throw new MoneyError(`Not a safe integer amount: ${String(minor)}`);
  return minor;
}

export function money(minor: number, currency: Currency): Money {
  return { minor: assertMinor(minor), currency };
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function negate(a: Money): Money {
  // -0 would print as "-₦0".
  return money(a.minor === 0 ? 0 : -a.minor, a.currency);
}

/** Sum of minor units, checked after every step. */
export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total = assertMinor(total + assertMinor(value));
  return total;
}

/** Sum in one currency; an empty list is zero in `currency`. */
export function sum(values: readonly Money[], currency: Currency): Money {
  let total = money(0, currency);
  for (const value of values) total = add(total, value);
  return total;
}

/** Totals per currency, in first-seen order. Mixed currencies are never added together. */
export function sumByCurrency(values: Iterable<Money>): Money[] {
  const totals = new Map<Currency, number>();
  for (const v of values) totals.set(v.currency, assertMinor((totals.get(v.currency) ?? 0) + assertMinor(v.minor)));
  return [...totals].map(([currency, minor]) => ({ minor, currency }));
}

/** "-4500.50" style exact decimal string for a minor amount. */
export function toDecimalString(minor: number, currency: Currency): string {
  assertMinor(minor);
  const exp = exponentOf(currency);
  const negative = minor < 0;
  const digits = String(Math.abs(minor));
  if (exp === 0) return (negative ? "-" : "") + digits;
  const padded = digits.padStart(exp + 1, "0");
  const whole = padded.slice(0, -exp);
  const frac = padded.slice(-exp);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

const AMOUNT = /^(\d+)(?:\.(\d*))?([km])?$/;

/**
 * Parses what a person types as an amount: "4500", "4,500", "4500.5",
 * "4.5k", "1.2m". Commas must group thousands. Returns minor units (always
 * >= 0; the caller picks the sign), or null when the text is not an amount or
 * has more decimals than the currency allows. Never touches a float.
 */
export function parseAmount(text: string, currency: Currency): number | null {
  let t = text.trim().toLowerCase().replaceAll("_", "");
  if (t.includes(",")) {
    const [intPart, ...rest] = t.split(".");
    if (rest.length > 1 || !intPart || !/^\d{1,3}(,\d{3})+$/.test(intPart)) return null;
    t = intPart.replaceAll(",", "") + (rest.length ? `.${rest[0] ?? ""}` : "");
  }
  const m = AMOUNT.exec(t);
  if (!m) return null;
  const whole = m[1] ?? "";
  let frac = m[2] ?? "";
  const shift = m[3] === "k" ? 3 : m[3] === "m" ? 6 : 0;
  // Move the decimal point right by `shift` places, as strings.
  let intDigits = whole + frac.slice(0, shift).padEnd(shift, "0");
  frac = frac.slice(shift);
  frac = frac.replace(/0+$/, "");
  const exp = exponentOf(currency);
  if (frac.length > exp) return null;
  intDigits = intDigits.replace(/^0+(?=\d)/, "");
  const minorDigits = intDigits + frac.padEnd(exp, "0");
  const value = Number(minorDigits);
  // Number() of a digit string is exact up to 2^53; past that, refuse.
  if (!Number.isSafeInteger(value) || BigInt(minorDigits) !== BigInt(value)) return null;
  return value;
}

export interface FormatOptions {
  /** "always" puts + on money in; "auto" shows only the minus. */
  sign?: "auto" | "always" | "never";
  locale?: string;
  /** Hide .00 on whole amounts (default true). */
  trimZeros?: boolean;
  compact?: boolean;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: Currency, o: FormatOptions): Intl.NumberFormat {
  const key = `${currency}|${o.locale ?? ""}|${o.sign ?? "auto"}|${o.trimZeros ?? true}|${o.compact ?? false}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(o.locale ?? "en-NG", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      signDisplay: o.sign === "always" ? "exceptZero" : o.sign === "never" ? "never" : "auto",
      ...(o.compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
      ...((o.trimZeros ?? true) && !o.compact ? { trailingZeroDisplay: "stripIfInteger" } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * The only way a money figure becomes text (V25): the exact decimal string
 * goes to Intl, so no float ever sits between the integer and the screen.
 */
export function formatMoney(m: Money, options: FormatOptions = {}): string {
  const decimal = toDecimalString(m.minor, m.currency) as Intl.StringNumericLiteral;
  return formatter(m.currency, options).format(decimal);
}

/** The amount as typed back into a field: "4500.5", no symbol, no grouping. */
export function toInputString(minor: number, currency: Currency): string {
  const s = toDecimalString(Math.abs(minor), currency);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
