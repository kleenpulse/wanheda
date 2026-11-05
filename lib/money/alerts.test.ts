import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Budget } from "./budgets";
import type { Txn } from "./money";

vi.mock("server-only", () => ({}));
const loadBudgetFacts = vi.fn();
const ensureRates = vi.fn(() => Promise.resolve(false));
const readRates = vi.fn(() => Promise.resolve([{ on: "2026-10-01", base: "USD", quote: "NGN", rate: "1500" }]));
const addNotices = vi.fn((_user: string, list: readonly { dedupeKey: string }[]) => Promise.resolve(list.map((n) => ({ ...n, id: n.dedupeKey }))));
vi.mock("./plans-store", () => ({ loadBudgetFacts }));
vi.mock("./fx-store", () => ({ ensureRates, readRates }));
vi.mock("./store", () => ({ loadAlertFacts: vi.fn() }));
vi.mock("@/lib/notifications/store", () => ({ addNotices }));

const { budgetAlertsForSave, raiseBudgetAlerts } = await import("./alerts");

const budget: Budget = { id: "b1", categoryId: null, amountMinor: 100_000, currency: "NGN", rollover: false, createdAt: 0 };
const txn = (amountMinor: number, currency: Txn["currency"]): Txn => ({
  id: `t${String(amountMinor)}`,
  accountId: "a",
  postedOn: "2026-11-02",
  amountMinor,
  currency,
  payee: "",
  categoryId: null,
  note: "",
  tags: [],
  source: "manual",
  transferId: null,
  createdAt: 1,
});
const facts = (txns: Txn[]) => ({ today: "2026-11-05", timeZone: "Africa/Lagos", budgets: [budget], categories: [], txns });

beforeEach(() => {
  loadBudgetFacts.mockReset();
  ensureRates.mockClear();
  readRates.mockClear();
  addNotices.mockClear();
});

describe("raiseBudgetAlerts", () => {
  it("one currency: no rates read or fetched, not stale", async () => {
    loadBudgetFacts.mockResolvedValue(facts([txn(-90_000, "NGN")]));
    const check = await raiseBudgetAlerts("u", { fetchRates: true });
    expect(check.stale).toBe(false);
    expect(check.notices.map((n) => n.dedupeKey)).toEqual(["budget:all:2026-11:80"]);
    expect(ensureRates).not.toHaveBeenCalled();
    expect(readRates).not.toHaveBeenCalled();
  });

  it("mixed currencies: stored rates only unless asked, then fetched first", async () => {
    loadBudgetFacts.mockResolvedValue(facts([txn(-50, "USD")]));
    const inline = await raiseBudgetAlerts("u");
    expect(inline.stale).toBe(true);
    expect(ensureRates).not.toHaveBeenCalled();
    // $0.50 at 1,500 = ₦750: under 80 %.
    expect(inline.notices).toEqual([]);
    const later = await raiseBudgetAlerts("u", { fetchRates: true });
    expect(later.stale).toBe(false);
    expect(ensureRates).toHaveBeenCalledWith("2026-10-01", "2026-11-05");
  });

  it("never throws", async () => {
    loadBudgetFacts.mockRejectedValue(new Error("down"));
    expect(await raiseBudgetAlerts("u")).toEqual({ notices: [], stale: false });
  });
});

describe("budgetAlertsForSave", () => {
  it("returns the inline notices and schedules a refresh only when stale", async () => {
    const later = vi.fn();
    loadBudgetFacts.mockResolvedValue(facts([txn(-100_000, "NGN")]));
    expect((await budgetAlertsForSave("u", later)).map((n) => n.dedupeKey)).toEqual(["budget:all:2026-11:100"]);
    expect(later).not.toHaveBeenCalled();

    loadBudgetFacts.mockResolvedValue(facts([txn(-100_000, "NGN"), txn(-10, "USD")]));
    await budgetAlertsForSave("u", later);
    expect(later).toHaveBeenCalledTimes(1);
  });
});
