import { describe, expect, it } from "vitest";
import {
  MoneyError,
  add,
  assertMinor,
  formatMoney,
  isCurrency,
  money,
  negate,
  parseAmount,
  sum,
  sumByCurrency,
  sumMinor,
  toDecimalString,
  toInputString,
} from "./currency";

describe("parseAmount", () => {
  it.each([
    ["4500", 450_000],
    ["4,500", 450_000],
    ["1,234,567", 123_456_700],
    ["4500.5", 450_050],
    ["4500.50", 450_050],
    ["0.01", 1],
    ["4.5k", 450_000],
    ["4.55k", 455_000],
    ["1.2m", 120_000_000],
    ["2k", 200_000],
    ["007", 700],
    [" 12 ", 1200],
    ["1_000", 100_000],
  ])("NGN %s → %d", (text, minor) => {
    expect(parseAmount(text, "NGN")).toBe(minor);
  });

  it.each(["", "abc", "4,50", "45,00", "1.2.3", "4500.505", "-5", "1e5", "0x10", "4.5kk", ",500", "Infinity", "NaN"])("refuses %j", (text) => {
    expect(parseAmount(text, "NGN")).toBeNull();
  });

  it("knows zero-decimal currencies", () => {
    expect(parseAmount("1500", "JPY")).toBe(1500);
    expect(parseAmount("1500.5", "JPY")).toBeNull();
    expect(parseAmount("1500.0", "JPY")).toBe(1500);
  });

  it("refuses amounts past 2^53 instead of rounding", () => {
    expect(parseAmount("90071992547409.91", "NGN")).toBe(9_007_199_254_740_991);
    expect(parseAmount("90071992547409.92", "NGN")).toBeNull();
    expect(parseAmount("99999999999999999999", "NGN")).toBeNull();
  });

  it("never goes through a float: 0.1 + 0.2 style inputs stay exact", () => {
    expect(parseAmount("0.29", "USD")).toBe(29);
    expect(parseAmount("1.005k", "USD")).toBe(100_500);
    expect(parseAmount("19.99", "USD")).toBe(1999);
  });
});

describe("arithmetic", () => {
  it("adds in one currency and refuses mixing", () => {
    expect(add(money(150, "NGN"), money(-50, "NGN"))).toEqual({ minor: 100, currency: "NGN" });
    expect(() => add(money(1, "NGN"), money(1, "USD"))).toThrow(MoneyError);
    expect(sum([money(1, "USD"), money(2, "USD")], "USD")).toEqual({ minor: 3, currency: "USD" });
    expect(sum([], "GBP")).toEqual({ minor: 0, currency: "GBP" });
  });

  it("refuses non-integers and unsafe totals", () => {
    expect(() => assertMinor(1.5)).toThrow(MoneyError);
    expect(() => assertMinor(Number.NaN)).toThrow(MoneyError);
    expect(() => money(0.1, "NGN")).toThrow(MoneyError);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
    expect(sumMinor([1, 2, -3])).toBe(0);
  });

  it("negates without a negative zero", () => {
    expect(Object.is(negate(money(0, "NGN")).minor, 0)).toBe(true);
    expect(negate(money(5, "NGN")).minor).toBe(-5);
  });

  it("totals per currency, never across", () => {
    expect(sumByCurrency([money(1, "NGN"), money(5, "USD"), money(2, "NGN")])).toEqual([
      { minor: 3, currency: "NGN" },
      { minor: 5, currency: "USD" },
    ]);
  });
});

describe("text", () => {
  it("writes exact decimals", () => {
    expect(toDecimalString(450_050, "NGN")).toBe("4500.50");
    expect(toDecimalString(-5, "NGN")).toBe("-0.05");
    expect(toDecimalString(0, "USD")).toBe("0.00");
    expect(toDecimalString(1500, "JPY")).toBe("1500");
    expect(toInputString(-450_050, "NGN")).toBe("4500.5");
    expect(toInputString(450_000, "NGN")).toBe("4500");
  });

  it("formats with the symbol, grouping and trimmed zeros", () => {
    expect(formatMoney(money(-450_000, "NGN"))).toBe("-₦4,500");
    expect(formatMoney(money(450_050, "NGN"))).toBe("₦4,500.50");
    expect(formatMoney(money(1_549, "USD"))).toBe("$15.49");
    expect(formatMoney(money(5_000_000, "NGN"), { sign: "always" })).toBe("+₦50,000");
    expect(formatMoney(money(-1, "NGN"), { sign: "never" })).toBe("₦0.01");
  });

  it("formats amounts a float would round", () => {
    expect(formatMoney(money(9_007_199_254_740_991, "NGN"))).toBe("₦90,071,992,547,409.91");
  });

  it("knows its currencies", () => {
    expect(isCurrency("NGN")).toBe(true);
    expect(isCurrency("ngn")).toBe(false);
    expect(isCurrency("toString")).toBe(false);
  });
});
