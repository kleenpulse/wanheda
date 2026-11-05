import { describe, expect, it } from "vitest";
import { cleanRates, convertExact, convertMinor, convertTotal, FxTable, isMixed, parseRate, ratesFromTable, type FxRate } from "./fx";

const USD_TABLE = { ngn: 1346.60127178, eur: 0.88802587, gbp: 0.74130979, jpy: 157.8973376, usd: 1, xyz: 3, btc: 0.00001 };

describe("parseRate", () => {
  it("reads decimal strings exactly and refuses anything else", () => {
    expect(parseRate("1346.60127178")).toEqual({ num: 134660127178n, den: 100000000n });
    expect(parseRate("2")).toEqual({ num: 2n, den: 1n });
    expect(parseRate("1.50000000")).toEqual({ num: 150000000n, den: 100000000n });
    for (const bad of ["0", "0.00000000", "-1", "1e3", "1.123456789", "", " 1", "12345678901"]) expect(parseRate(bad)).toBeNull();
  });
});

describe("ratesFromTable", () => {
  it("keeps known currencies, stored in the direction that is at least 1 (V26)", () => {
    const rates = ratesFromTable("2026-11-05", USD_TABLE);
    const by = Object.fromEntries(rates.map((r) => [`${r.base}${r.quote}`, r.rate]));
    expect(by.USDNGN).toBe("1346.60127178");
    expect(by.USDJPY).toBe("157.89733760");
    // EUR is below 1 per USD, so the row is turned around: 1 EUR = 1.126… USD.
    expect(by.EURUSD).toBe("1.12609332");
    expect(by.GBPUSD).toBe("1.34896370");
    expect(rates.every((r) => Number(r.rate) >= 1)).toBe(true);
    // Unknown codes, the pivot itself and bad days are skipped.
    expect(rates.some((r) => r.base === "USD" && r.quote === "USD")).toBe(false);
    expect(ratesFromTable("2026-13-01", USD_TABLE)).toEqual([]);
  });

  it("skips values that are not positive finite numbers", () => {
    expect(ratesFromTable("2026-11-05", { ngn: "1300", eur: 0, gbp: -1, jpy: Number.NaN, cad: Infinity })).toEqual([]);
  });
});

describe("conversion", () => {
  const rates: FxRate[] = [
    { on: "2026-11-01", base: "USD", quote: "NGN", rate: "1500" },
    { on: "2026-11-03", base: "USD", quote: "NGN", rate: "1600" },
    { on: "2026-11-01", base: "EUR", quote: "USD", rate: "1.25" },
    { on: "2026-11-01", base: "USD", quote: "JPY", rate: "150" },
  ];
  const table = new FxTable(rates);

  it("uses the day's rate, else the latest earlier one, never a later one", () => {
    expect(convertMinor(100, "USD", "NGN", "2026-11-01", table)).toBe(150_000);
    expect(convertMinor(100, "USD", "NGN", "2026-11-02", table)).toBe(150_000);
    expect(convertMinor(100, "USD", "NGN", "2026-11-03", table)).toBe(160_000);
    expect(convertMinor(100, "USD", "NGN", "2026-10-31", table)).toBeNull();
  });

  it("crosses through USD and the inverse direction exactly", () => {
    // €1 = $1.25 = ₦1,875.
    expect(convertMinor(100, "EUR", "NGN", "2026-11-02", table)).toBe(187_500);
    // ₦1,875 = €1.
    expect(convertMinor(187_500, "NGN", "EUR", "2026-11-02", table)).toBe(100);
    expect(convertExact(1, "NGN", "USD", "2026-11-02", table)).toEqual({ num: 1n, den: 1500n });
  });

  it("respects each currency's exponent", () => {
    // ¥150 (0 dp) = $1.00 = 100 cents.
    expect(convertMinor(150, "JPY", "USD", "2026-11-01", table)).toBe(100);
    expect(convertMinor(100, "USD", "JPY", "2026-11-01", table)).toBe(150);
  });

  it("rounds half-even once", () => {
    const t = new FxTable([{ on: "2026-11-01", base: "USD", quote: "NGN", rate: "1.5" }]);
    // 1 cent × 1.5 = 1.5 kobo → 2; 3 cents = 4.5 → 4.
    expect(convertMinor(1, "USD", "NGN", "2026-11-01", t)).toBe(2);
    expect(convertMinor(3, "USD", "NGN", "2026-11-01", t)).toBe(4);
    // Added exactly first: 1.5 + 1.5 = 3, not 2 + 2.
    expect(convertTotal([{ minor: 1, currency: "USD", on: "2026-11-01" }, { minor: 1, currency: "USD", on: "2026-11-01" }], "NGN", t).total.minor).toBe(3);
  });

  it("keeps what has no rate apart, never guessed (V26)", () => {
    const c = convertTotal(
      [
        { minor: 50_000, currency: "NGN", on: "2026-10-01" },
        { minor: 100, currency: "USD", on: "2026-11-02" },
        { minor: 200, currency: "USD", on: "2026-10-01" },
        { minor: 500, currency: "GBP", on: "2026-11-02" },
      ],
      "NGN",
      table,
    );
    expect(c.total).toEqual({ minor: 200_000, currency: "NGN" });
    expect(c.missing).toEqual([
      { minor: 200, currency: "USD" },
      { minor: 500, currency: "GBP" },
    ]);
    expect(c.originals).toEqual([
      { minor: 50_000, currency: "NGN" },
      { minor: 300, currency: "USD" },
      { minor: 500, currency: "GBP" },
    ]);
    expect(isMixed(c)).toBe(true);
    expect(isMixed(convertTotal([{ minor: 1, currency: "NGN", on: "2026-11-01" }], "NGN", table))).toBe(false);
  });

  it("needs no rate for the same currency", () => {
    expect(convertMinor(123, "NGN", "NGN", "1999-01-01", new FxTable([]))).toBe(123);
  });
});

describe("cleanRates", () => {
  it("drops malformed rows read back from the database", () => {
    const rows = [
      { on: "2026-11-01", base: "USD", quote: "NGN", rate: "1500.00000000" },
      { on: "2026-11-01", base: "USD", quote: "XXX", rate: "1" },
      { on: "nope", base: "USD", quote: "NGN", rate: "1" },
      { on: "2026-11-01", base: "USD", quote: "NGN", rate: 1 },
    ];
    expect(cleanRates(rows)).toEqual([{ on: "2026-11-01", base: "USD", quote: "NGN", rate: "1500.00000000" }]);
  });

  it("table latestDay", () => {
    expect(new FxTable(cleanRates([{ on: "2026-11-01", base: "USD", quote: "NGN", rate: "1" }])).latestDay()).toBe("2026-11-01");
    expect(new FxTable([]).latestDay()).toBeNull();
  });
});
