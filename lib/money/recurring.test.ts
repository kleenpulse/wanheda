import { describe, expect, it } from "vitest";
import type { Txn } from "./money";
import { detectRecurring, recurringPayee } from "./recurring";
import { blankSubscription, type Subscription } from "./subscriptions";

let n = 0;
function txn(postedOn: string, amountMinor: number, payee: string, over: Partial<Txn> = {}): Txn {
  n++;
  return {
    id: `t${String(n)}`,
    accountId: "acc",
    postedOn,
    amountMinor,
    currency: "USD",
    payee,
    categoryId: null,
    note: "",
    tags: [],
    source: "import",
    transferId: null,
    createdAt: n,
    ...over,
  };
}

const TODAY = "2026-11-05";

describe("recurringPayee", () => {
  it("groups the same merchant across bank noise", () => {
    expect(recurringPayee("NETFLIX.COM 866-579-7172")).toBe("netflix.com");
    expect(recurringPayee("POS PURCHASE NETFLIX.COM 4411")).toBe("netflix.com");
    expect(recurringPayee("Spotify P2C3D4 XXXX1234")).toBe("spotify p2c3d4");
  });
});

describe("detectRecurring (FR-MONEY-11)", () => {
  it("suggests a monthly charge seen 3 times, with month-end and ±3 day drift", () => {
    const txns = [
      txn("2026-08-31", -1_549, "NETFLIX.COM 866"),
      txn("2026-10-01", -1_549, "NETFLIX.COM 866"), // Sep 30 + 1 day
      txn("2026-10-31", -1_549, "NETFLIX.COM 866"),
    ];
    expect(detectRecurring(txns, [], TODAY)).toEqual([
      {
        key: "USD|netflix.com",
        name: "Netflix.com",
        amountMinor: 1_549,
        currency: "USD",
        cycle: "month",
        intervalCount: 1,
        lastOn: "2026-10-31",
        lastTxnId: txns[2]?.id,
        accountId: "acc",
        categoryId: null,
        hits: 3,
      },
    ]);
  });

  it("allows 10 % on the amount, not more", () => {
    const ok = [txn("2026-08-05", -1_000, "GYM"), txn("2026-09-05", -1_100, "GYM"), txn("2026-10-05", -1_050, "GYM")];
    expect(detectRecurring(ok, [], TODAY)).toHaveLength(1);
    const far = [txn("2026-08-05", -1_000, "GYM"), txn("2026-09-05", -1_200, "GYM"), txn("2026-10-05", -1_000, "GYM")];
    expect(detectRecurring(far, [], TODAY)).toEqual([]);
  });

  it("needs 3 hits and a cadence", () => {
    expect(detectRecurring([txn("2026-09-05", -999, "ICLOUD"), txn("2026-10-05", -999, "ICLOUD")], [], TODAY)).toEqual([]);
    const random = [txn("2026-09-01", -999, "UBER"), txn("2026-09-12", -999, "UBER"), txn("2026-10-20", -999, "UBER")];
    expect(detectRecurring(random, [], TODAY)).toEqual([]);
  });

  it("passes over a one-off at the same payee between charges", () => {
    const txns = [txn("2026-08-10", -500, "SPOTIFY"), txn("2026-09-10", -500, "SPOTIFY"), txn("2026-09-20", -2_500, "SPOTIFY"), txn("2026-10-10", -500, "SPOTIFY")];
    const [s] = detectRecurring(txns, [], TODAY);
    expect(s?.hits).toBe(3);
    expect(s?.amountMinor).toBe(500);
  });

  it("finds weekly and yearly cadences", () => {
    const weekly = [txn("2026-10-15", -300, "LAUNDRY"), txn("2026-10-22", -300, "LAUNDRY"), txn("2026-10-29", -300, "LAUNDRY")];
    expect(detectRecurring(weekly, [], TODAY)[0]).toMatchObject({ cycle: "week", intervalCount: 1 });
    const yearly = [txn("2024-03-01", -1_200, "DOMAIN"), txn("2025-03-02", -1_200, "DOMAIN"), txn("2026-03-01", -1_200, "DOMAIN")];
    expect(detectRecurring(yearly, [], TODAY)[0]).toMatchObject({ cycle: "year", intervalCount: 1 });
  });

  it("skips money in, transfers, stopped charges and existing subscriptions", () => {
    const base = [txn("2026-08-05", -1_549, "NETFLIX"), txn("2026-09-05", -1_549, "NETFLIX"), txn("2026-10-05", -1_549, "NETFLIX")];
    expect(detectRecurring(base.map((t) => ({ ...t, amountMinor: 1_549 })), [], TODAY)).toEqual([]);
    expect(detectRecurring(base.map((t) => ({ ...t, transferId: "x" })), [], TODAY)).toEqual([]);
    expect(detectRecurring(base, [], "2027-01-20")).toEqual([]);
    const sub: Subscription = { ...blankSubscription(TODAY, "USD"), id: "s", createdAt: 0, name: "Netflix", amountMinor: 1_549 };
    expect(detectRecurring(base, [sub], TODAY)).toEqual([]);
    expect(detectRecurring(base, [{ ...sub, name: "Films", accountId: "acc" }], TODAY)).toEqual([]);
  });
});
