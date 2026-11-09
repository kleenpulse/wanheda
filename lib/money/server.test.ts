import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Owner } from "@/lib/auth/owner";

// What /api/money serves and the money page prefetches (G4, V24): demo's
// seed, the owner's ledger, or an honest "load failed".

vi.mock("server-only", () => ({}));
const loadMoney = vi.fn();
const loadTxnRange = vi.fn();
vi.mock("./store", async (original) => ({ ...(await original<typeof import("./store")>()), loadMoney, loadTxnRange }));

const { moneyFor, moneyRangeFor } = await import("./server");

const OWNER: Owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" }, admin: false };
const DEMO: Owner = { kind: "demo" };

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-05T12:00:00Z") });
  loadMoney.mockReset();
  loadTxnRange.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("moneyFor", () => {
  it("serves demo its seed, never the database", async () => {
    const got = await moneyFor(DEMO);
    expect(got.source).toBe("demo");
    expect(got.txns.length).toBeGreaterThan(0);
    expect(loadMoney).not.toHaveBeenCalled();
  });

  it("serves the owner's ledger with their settings", async () => {
    loadMoney.mockResolvedValue({
      kind: "loaded",
      settings: { baseCurrency: "USD", timeZone: "Europe/London" },
      today: "2026-11-05",
      since: "2026-09-01",
      accounts: [],
      categories: [],
      txns: [],
      priorMinor: { a: 5 },
      truncated: true,
      subscriptions: [],
      budgets: [],
      rules: [],
    });
    const got = await moneyFor(OWNER);
    expect(loadMoney).toHaveBeenCalledWith("user-1");
    expect(got).toMatchObject({ source: "owner", baseCurrency: "USD", timeZone: "Europe/London", since: "2026-09-01", priorMinor: { a: 5 }, windowTruncated: true });
  });

  it("says the load failed, with an empty ledger, rather than show demo data", async () => {
    loadMoney.mockResolvedValue({ kind: "failed" });
    const got = await moneyFor(OWNER);
    expect(got).toMatchObject({ source: "load-failed", accounts: [], txns: [], subscriptions: [], budgets: [], rules: [], since: "2026-09-01" });
  });
});

describe("moneyRangeFor", () => {
  it("demo has nothing before its window", async () => {
    expect(await moneyRangeFor(DEMO, "2026-06-01", "2026-06-30")).toEqual({ from: "2026-06-01", to: "2026-06-30", txns: [], truncated: false });
  });

  it("the owner's older range, or null when the read failed", async () => {
    loadTxnRange.mockResolvedValueOnce({ txns: [], truncated: false });
    expect(await moneyRangeFor(OWNER, "2026-06-01", "2026-06-30")).toEqual({ from: "2026-06-01", to: "2026-06-30", txns: [], truncated: false });
    expect(loadTxnRange).toHaveBeenCalledWith("user-1", "2026-06-01", "2026-06-30");
    loadTxnRange.mockResolvedValueOnce(null);
    expect(await moneyRangeFor(OWNER, "2026-06-01", "2026-06-30")).toBeNull();
  });
});
