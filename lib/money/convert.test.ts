import { describe, expect, it } from "vitest";
import { addRatio, compareRatio, roundHalfEven, scale, ZERO } from "./convert";
import { MoneyError } from "./currency";

describe("scale (V26)", () => {
  it("is exact and reduced", () => {
    expect(scale(1_000, 52, 12)).toEqual({ num: 13_000n, den: 3n });
    expect(scale(-1_000, 52, 12)).toEqual({ num: -13_000n, den: 3n });
    expect(scale(0, 5, 7)).toEqual({ num: 0n, den: 1n });
  });

  it("keeps the denominator positive", () => {
    expect(scale(10, 1, -4)).toEqual({ num: -5n, den: 2n });
  });

  it("refuses unsafe amounts, fractional factors and a zero divisor", () => {
    expect(() => scale(Number.MAX_SAFE_INTEGER + 1, 1, 1)).toThrow(MoneyError);
    expect(() => scale(1.5, 1, 1)).toThrow(MoneyError);
    expect(() => scale(100, 1.5, 1)).toThrow(MoneyError);
    expect(() => scale(100, 1, 0)).toThrow(MoneyError);
  });
});

describe("addRatio and compareRatio", () => {
  it("adds fractions exactly: 1/3 + 1/6 = 1/2", () => {
    expect(addRatio({ num: 1n, den: 3n }, { num: 1n, den: 6n })).toEqual({ num: 1n, den: 2n });
    expect(addRatio(ZERO, { num: -7n, den: 4n })).toEqual({ num: -7n, den: 4n });
  });

  it("orders by value, not by parts", () => {
    expect(compareRatio({ num: 1n, den: 3n }, { num: 2n, den: 6n })).toBe(0);
    expect(compareRatio({ num: 1n, den: 3n }, { num: 1n, den: 2n })).toBe(-1);
    expect(compareRatio({ num: -1n, den: 3n }, { num: -1n, den: 2n })).toBe(1);
  });
});

describe("roundHalfEven", () => {
  it("rounds ties to even, both signs", () => {
    const half = (n: bigint) => ({ num: n, den: 2n });
    expect([1n, 3n, 5n, -1n, -3n, -5n].map((n) => roundHalfEven(half(n)))).toEqual([0, 2, 2, 0, -2, -2]);
  });

  it("rounds non-ties to nearest", () => {
    expect(roundHalfEven({ num: 13_000n, den: 3n })).toBe(4_333);
    expect(roundHalfEven({ num: 26_000n, den: 3n })).toBe(8_667);
    expect(roundHalfEven({ num: -26_000n, den: 3n })).toBe(-8_667);
  });

  it("never returns -0", () => {
    expect(Object.is(roundHalfEven({ num: -1n, den: 4n }), 0)).toBe(true);
  });

  it("throws past a safe integer rather than lose precision (V25)", () => {
    expect(() => roundHalfEven({ num: BigInt(Number.MAX_SAFE_INTEGER) + 1n, den: 1n })).toThrow(MoneyError);
  });
});
