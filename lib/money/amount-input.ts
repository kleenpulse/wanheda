// The brain behind every money field (MoneyInput). Pure, so it is unit-tested
// without a DOM. A field holds text such as "20,000", "2.5k" or "1,500 + 2,300";
// this module decides which keystrokes the text may take, cleans what is
// pasted, groups thousands as the person types, and works out the amount.
//
// The calculator never does float math on money (SPEC V10, V25): each number
// becomes an exact fraction of BigInts, and the result is rounded half away
// from zero to the currency's minor unit once, at the end. 0.1 + 0.2 is 0.30.

import { CURRENCY_CODES, exponentOf, formatMoney, toDecimalString, type Currency } from "./currency";

export type AmountRule = "positive" | "any";

export interface AmountOptions {
  currency: Currency;
  /** A leading minus (an opening balance in debt). Off: the sign comes from elsewhere. */
  allowNegative?: boolean;
}

/** Digits in one number, so minor units stay well inside a safe integer. */
export const MAX_DIGITS = 15;

const OPERATORS = new Set(["+", "-", "×", "÷"]);

/**
 * One character as the field keeps it, or "" to drop it. Context-free, so a
 * caret position can be carried through it character by character.
 */
export function normalizeChar(ch: string): string {
  if (ch >= "0" && ch <= "9") return ch;
  switch (ch) {
    case ".":
    case "+":
    case "-":
    case "×":
    case "÷":
    case "(":
    case ")":
    case "k":
    case "m":
      return ch;
    case "K":
      return "k";
    case "M":
      return "m";
    case "*":
    case "x":
    case "X":
      return "×";
    case "/":
      return "÷";
    case "−":
    case "–":
      return "-";
    default:
      // Letters, symbols, spaces and the grouping commas (put back by `group`).
      return "";
  }
}

export function normalize(text: string): string {
  let out = "";
  for (const ch of text) out += normalizeChar(ch);
  return out;
}

/**
 * Whether normalized text can still grow into an amount: one dot per number
 * and no more decimals than the currency has, k or m once at the end of a
 * number, a minus in front of a number only when negatives are allowed, and
 * balanced brackets. A currency without decimals still takes up to 3 while
 * typing, so "2.5k" works; a bare "2.5" is caught when the field is read.
 */
export function isValidPrefix(text: string, { currency, allowNegative = false }: AmountOptions): boolean {
  const exp = exponentOf(currency);
  const maxDecimals = exp === 0 ? 3 : exp;
  let state: "operand" | "number" | "after" = "operand";
  let depth = 0;
  let digits = 0;
  let decimals = 0;
  let dot = false;
  let suffix = false;
  let unary = false;
  for (const ch of text) {
    const digit = ch >= "0" && ch <= "9";
    if (state === "operand") {
      if (digit) {
        state = "number";
        digits = 1;
        decimals = 0;
        dot = false;
        suffix = false;
        unary = false;
      } else if (ch === ".") {
        // ".5" starts a number too.
        state = "number";
        digits = 0;
        decimals = 0;
        dot = true;
        suffix = false;
        unary = false;
      } else if (ch === "(") {
        depth++;
        unary = false;
      } else if (ch === "-" && allowNegative && !unary) {
        unary = true;
      } else return false;
      continue;
    }
    if (state === "number") {
      if (digit) {
        if (suffix) return false;
        if (dot && ++decimals > maxDecimals) return false;
        if (++digits > MAX_DIGITS) return false;
        continue;
      }
      if (ch === ".") {
        if (dot || suffix) return false;
        dot = true;
        continue;
      }
      if (ch === "k" || ch === "m") {
        if (suffix) return false;
        suffix = true;
        continue;
      }
    }
    if (OPERATORS.has(ch)) {
      state = "operand";
      unary = false;
    } else if (ch === ")" && depth > 0) {
      depth--;
      state = "after";
    } else return false;
  }
  return true;
}

export interface Edit {
  text: string;
  caret: number;
}

/**
 * Thousands commas in the whole part of every number, with the caret kept
 * after the same character: `keep` counts the characters (commas excluded)
 * left of the caret.
 */
export function group(text: string, keep = Number.POSITIVE_INFINITY): Edit {
  let out = "";
  let caret = keep <= 0 ? 0 : -1;
  let seen = 0;
  let prev = "";
  for (const run of text.match(/\d+|\D/g) ?? []) {
    const whole = /^\d/.test(run) && prev !== ".";
    for (let j = 0; j < run.length; j++) {
      if (whole && j > 0 && (run.length - j) % 3 === 0) out += ",";
      out += run[j] ?? "";
      if (++seen === keep) caret = out.length;
    }
    prev = run;
  }
  return { text: out, caret: caret < 0 ? out.length : caret };
}

/**
 * The field's next text after an edit. `raw` is what the input now holds and
 * `caret` where its caret sits. An insert (typing, even over a selection) that
 * would break the amount is refused and the text stays as it was. A delete is
 * always kept. A paste that isn't a clean amount is kept exactly as pasted,
 * so the field shows the error on blur instead of quietly joining "1e5" into
 * "15".
 */
export function applyEdit(prev: string, raw: string, caret: number, options: AmountOptions, mode: "insert" | "delete" | "paste"): Edit {
  let next = normalize(raw);
  let keep = normalize(raw.slice(0, caret)).length;
  if (mode === "paste" && (hasJunk(raw) || !isValidPrefix(next, options))) return { text: raw, caret };
  const before = normalize(prev);
  if (mode === "insert" && !isValidPrefix(next, options) && isValidPrefix(before, options)) {
    keep = Math.max(0, Math.min(before.length, keep - (next.length - before.length)));
    next = before;
  }
  return group(next, keep);
}

/** Characters that can't be in an amount at all (commas and spaces can: they group). */
export function hasJunk(text: string): boolean {
  return /[^\d.,\s+\-−–×÷*/xX()kKmM]/.test(text);
}

const CODES = new RegExp(["KSh", "GH₵", "CA\\$", "US\\$", ...CURRENCY_CODES].join("|"), "gi");

/**
 * Pasted text made ready for the field: currency codes, symbols and spaces
 * go; a statement's "(1,234.50)" or "1,234.50-" is a negative; "1.234,50"
 * is read the European way. Without negatives the sign is dropped, since
 * the form decides it.
 */
export function cleanPaste(text: string, allowNegative: boolean): string {
  let t = text.replace(/\s/g, "").replace(CODES, "").replace(/[₦$£€¥₵]/g, "");
  let negative = false;
  const wrapped = /^\(([\d.,]+)\)$/.exec(t) ?? /^([\d.,]+)[-−]$/.exec(t);
  if (wrapped) {
    negative = true;
    t = wrapped[1] ?? "";
  } else if (/^[-−]/.test(t)) {
    negative = true;
    t = t.slice(1);
  }
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(t)) t = t.replaceAll(".", "").replace(",", ".");
  return negative && allowNegative ? `-${t}` : t;
}

// ── The calculator ──────────────────────────────────────────────────────────

interface Fraction {
  n: bigint;
  d: bigint;
}

class CalcError extends Error {}

const NOT_AN_AMOUNT = "Not an amount";

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x === 0n ? 1n : x;
}

function fraction(n: bigint, d: bigint): Fraction {
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export type Evaluated = { minor: number } | { error: string };

/** The amount the text comes to, in minor units, or why it isn't one. */
export function evaluate(text: string, currency: Currency): Evaluated {
  if (hasJunk(text)) return { error: NOT_AN_AMOUNT };
  const t = normalize(text);
  const exp = exponentOf(currency);
  let i = 0;

  const literal = (): Fraction => {
    const m = /^(\d*)(?:\.(\d*))?([km])?/.exec(t.slice(i));
    if (!m || (m[1] ?? "") + (m[2] ?? "") === "") throw new CalcError(NOT_AN_AMOUNT);
    i += m[0].length;
    const frac = m[2] ?? "";
    const shift = m[3] === "k" ? 3n : m[3] === "m" ? 6n : 0n;
    return fraction(BigInt((m[1] ?? "") + frac) * 10n ** shift, 10n ** BigInt(frac.length));
  };
  const factor = (): Fraction => {
    if (t[i] === "-") {
      i++;
      const v = factor();
      return { n: -v.n, d: v.d };
    }
    if (t[i] === "(") {
      i++;
      const v = sum();
      if (t[i] !== ")") throw new CalcError(NOT_AN_AMOUNT);
      i++;
      return v;
    }
    return literal();
  };
  const product = (): Fraction => {
    let v = factor();
    while (t[i] === "×" || t[i] === "÷") {
      const op = t[i++];
      const r = factor();
      if (op === "×") v = fraction(v.n * r.n, v.d * r.d);
      else if (r.n === 0n) throw new CalcError("Can't divide by 0");
      else v = fraction(v.n * r.d, v.d * r.n);
    }
    return v;
  };
  const sum = (): Fraction => {
    let v = product();
    while (t[i] === "+" || t[i] === "-") {
      const op = t[i++];
      const r = product();
      v = fraction(op === "+" ? v.n * r.d + r.n * v.d : v.n * r.d - r.n * v.d, v.d * r.d);
    }
    return v;
  };

  let value: Fraction;
  try {
    value = sum();
    if (i !== t.length) throw new CalcError(NOT_AN_AMOUNT);
  } catch (e) {
    if (e instanceof CalcError) return { error: e.message };
    throw e;
  }

  const scaled = value.n * 10n ** BigInt(exp);
  let minor = scaled / value.d;
  const rest = scaled % value.d;
  // One number with more decimals than the currency has is a typo, not a sum to round.
  if (rest !== 0n && /^-?\d*(\.\d*)?[km]?$/.test(t)) {
    return { error: exp === 0 ? `No decimals in ${currency}` : `Only ${String(exp)} decimals in ${currency}` };
  }
  if (2n * (rest < 0n ? -rest : rest) >= value.d) minor += scaled < 0n ? -1n : 1n;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER)) return { error: "Too large" };
  return { minor: Number(minor) };
}

export interface AmountRead {
  /** What the text comes to, before the field's rule; null when it can't be read. */
  value: number | null;
  /** The amount the form may save: read and allowed by the rule. */
  minor: number | null;
  error: string | null;
}

/**
 * Reads a field. With `emptyMessage` the field is required; without it an
 * empty field is 0 (an opening balance).
 */
export function readAmount(text: string, currency: Currency, rule: AmountRule, emptyMessage?: string): AmountRead {
  // Junk alone ("abc", pasted) is not an amount, not an empty field.
  if (text.replace(/[\s,]/g, "") === "") return emptyMessage === undefined ? { value: 0, minor: 0, error: null } : { value: null, minor: null, error: emptyMessage };
  const result = evaluate(text, currency);
  if ("error" in result) return { value: null, minor: null, error: result.error };
  if (rule === "positive" && result.minor <= 0) return { value: result.minor, minor: null, error: "Must be more than 0" };
  return { value: result.minor, minor: result.minor, error: null };
}

/** A plain number ("20,000.50", "-300"), as opposed to a sum or a short form like "20k". */
export function isPlain(text: string): boolean {
  return /^-?\d*(\.\d*)?$/.test(normalize(text));
}

/** The amount as the field shows it once read: grouped, decimals only when it has any. */
export function plainText(minor: number, currency: Currency): string {
  return group(toDecimalString(minor, currency).replace(/\.0+$/, "")).text;
}

/** The currency's symbol on its own ("₦", "$", "¥"), for the start of the field. */
export function currencySymbol(currency: Currency): string {
  return formatMoney({ minor: 0, currency }).replace(/[\d.,\s]/g, "");
}
