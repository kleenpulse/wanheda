import { assertMinor, MoneyError } from "./currency";

// Multiplying and dividing money (SPEC V26). Every such figure is an exact
// fraction of integers (bigint), added up exactly, and rounded half-even once,
// at the end, for the one figure shown. No float ever holds an amount.

/** An exact fraction of minor units. `den` is always > 0. */
export interface Ratio {
  num: bigint;
  den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function reduce(num: bigint, den: bigint): Ratio {
  if (den === 0n) throw new MoneyError("Division by zero");
  const sign = den < 0n ? -1n : 1n;
  const g = gcd(num, den) || 1n;
  return { num: (sign * num) / g, den: (sign * den) / g };
}

export const ZERO: Ratio = { num: 0n, den: 1n };

/** `minor × num ÷ den`, exactly. */
export function scale(minor: number, num: number, den: number): Ratio {
  assertMinor(minor);
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) throw new MoneyError("Scale factors must be whole numbers");
  return reduce(BigInt(minor) * BigInt(num), BigInt(den));
}

export function addRatio(a: Ratio, b: Ratio): Ratio {
  return reduce(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** −1, 0 or 1 as a is below, equal to or above b. */
export function compareRatio(a: Ratio, b: Ratio): number {
  const l = a.num * b.den;
  const r = b.num * a.den;
  return l < r ? -1 : l > r ? 1 : 0;
}

/** The nearest whole number of minor units, ties to even (banker's rounding), checked safe (V25). */
export function roundHalfEven(r: Ratio): number {
  const negative = r.num < 0n;
  const n = negative ? -r.num : r.num;
  let q = n / r.den;
  const twice = (n % r.den) * 2n;
  if (twice > r.den || (twice === r.den && q % 2n === 1n)) q += 1n;
  const out = Number(negative ? -q : q);
  if (!Number.isSafeInteger(out)) throw new MoneyError(`Not a safe integer amount: ${String(q)}`);
  // -0 would print as "-₦0".
  return out === 0 ? 0 : out;
}
