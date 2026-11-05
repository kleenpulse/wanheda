import "server-only";
import type { Owner } from "@/lib/auth/owner";
import { DEFAULT_TIME_ZONE, todayIn, type Day } from "./dates";
import type { MoneyPayload, TxnRangePayload } from "./money";
import { seedMoney } from "./seed";
import { loadMoney, loadTxnRange, windowStart } from "./store";

// What the money page prefetches and /api/money serves: the owner's ledger
// window, or demo's seed (G4). One function, so the RSC prefetch and the
// client's refetch can never disagree on shape.

export async function moneyFor(owner: Owner): Promise<MoneyPayload> {
  if (owner.kind === "demo") return seedMoney(todayIn(DEFAULT_TIME_ZONE));
  const loaded = await loadMoney(owner.user.id);
  if (loaded.kind === "failed") {
    const today = todayIn(DEFAULT_TIME_ZONE);
    return {
      source: "load-failed",
      baseCurrency: "NGN",
      timeZone: DEFAULT_TIME_ZONE,
      since: windowStart(today),
      accounts: [],
      categories: [],
      txns: [],
      priorMinor: {},
    };
  }
  return {
    source: "owner",
    baseCurrency: loaded.settings.baseCurrency,
    timeZone: loaded.settings.timeZone,
    since: loaded.since,
    accounts: loaded.accounts,
    categories: loaded.categories,
    txns: loaded.txns,
    priorMinor: loaded.priorMinor,
    windowTruncated: loaded.truncated,
  };
}

/**
 * The owner's txns for a range older than the loaded window, or null when the
 * read failed. Demo has nothing before its seed window.
 */
export async function moneyRangeFor(owner: Owner, from: Day, to: Day): Promise<TxnRangePayload | null> {
  if (owner.kind === "demo") return { from, to, txns: [], truncated: false };
  const loaded = await loadTxnRange(owner.user.id, from, to);
  return loaded ? { from, to, ...loaded } : null;
}
