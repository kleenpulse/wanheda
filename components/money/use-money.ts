"use client";

import * as React from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { fetchJson } from "@/lib/fetch-json";
import type { Budget } from "@/lib/money/budgets";
import { addMonths, startOfMonth, todayIn, type Day } from "@/lib/money/dates";
import { FX_KEY, FxTable, type FxPayload } from "@/lib/money/fx";
import { olderRange } from "@/lib/money/periods";
import {
  MONEY_KEY,
  MONEY_RANGE_KEY,
  applyPending,
  applyPendingAccounts,
  applyPendingCategories,
  applyPendingPlans,
  applyPendingSubscriptions,
  type Account,
  type Category,
  type MoneyPayload,
  type Txn,
  type TxnRangePayload,
} from "@/lib/money/money";
import { applyRules, type Rule } from "@/lib/money/rules";
import type { Subscription } from "@/lib/money/subscriptions";
import { useMoneyRuntime } from "./money-provider";
import { describeTxn, useMoneyLocal } from "./money-runtime";

// The money cache (V24): every money view reads one TanStack Query entry,
// filled by the page's Prefetch or by /api/money, with this device's
// unconfirmed writes laid over it. Writes show at once and go through the
// device outbox, which keeps them until the server has them, across reloads
// and dead zones (money-runtime.ts, SPEC V28).

const LAST_ACCOUNT_KEY = "wanheda-money-account";

export function lastAccountId(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function rememberAccount(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // Private mode: the first open account is the default instead.
  }
}

/** The money payload with pending writes applied, or null before the first load. */
export function useMoney(options: { enabled?: boolean } = {}) {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: MONEY_KEY,
    queryFn: () => fetchJson<MoneyPayload>("/api/money"),
    // Demo's ledger is the seed: nothing to pull, its edits live in this tab.
    staleTime: demo ? Infinity : 30_000,
    enabled: options.enabled ?? true,
  });
  const pending = useMoneyLocal((s) => s.txns);
  const accounts = useMoneyLocal((s) => s.accounts);
  const subs = useMoneyLocal((s) => s.subs);
  const budgets = useMoneyLocal((s) => s.budgets);
  const rules = useMoneyLocal((s) => s.rules);
  const cats = useMoneyLocal((s) => s.categories);
  // The server renders without the payload. If the page's Prefetch hydrates
  // first, the cache already holds it in the hydration pass, and painting it
  // there would not match the server (React #418). Hops never hydrate, so they
  // still paint from the cache at once (V24).
  const hydrated = useHydrated();
  const data = React.useMemo(
    () =>
      hydrated && query.data
        ? applyPendingCategories(
            applyPendingPlans(applyPendingSubscriptions(applyPendingAccounts(applyPending(query.data, pending), accounts), subs), budgets, rules),
            cats,
          )
        : null,
    [hydrated, query.data, pending, accounts, subs, budgets, rules, cats],
  );
  return { data, failed: hydrated && query.isError && !query.data, refetch: query.refetch };
}

export interface Ledger {
  /** Every txn this device knows from `from` on, newest first, pending writes laid over. */
  txns: Txn[];
  /** Older entries are still on their way: figures before the window are not in yet. */
  loadingOlder: boolean;
  olderFailed: boolean;
  /** The older read hit its row cap, so totals before the window are short. */
  truncated: boolean;
}

/**
 * The txns [from, to] needs. The money window (this month and the two
 * before) is already on the device; a range that starts earlier pulls only
 * its own days before the window from /api/money/range and joins them on
 * (V24: the window part paints at once). Bounded by the range's end, so an old
 * period never pulls everything up to the window (review FIX). Demo has
 * nothing before its seed.
 */
export function useLedger(payload: MoneyPayload, from: Day, to: Day): Ledger {
  const owner = useAccount().kind === "owner";
  const since = payload.since;
  const range = owner ? olderRange(from, to, since) : null;
  const needOlder = range !== null;
  const query = useQuery({
    queryKey: [MONEY_RANGE_KEY, range?.from ?? from, range?.to ?? to],
    queryFn: () => fetchJson<TxnRangePayload>(`/api/money/range?from=${range?.from ?? from}&to=${range?.to ?? to}`),
    enabled: needOlder,
    staleTime: 60_000,
  });
  const pending = useMoneyLocal((s) => s.txns);
  const older = query.data;
  const txns = React.useMemo(() => {
    const inWindow = payload.txns.filter((t) => t.postedOn >= since);
    if (!needOlder || !older) return inWindow;
    // The same pending writes as the window, so an edit to an old row shows at once too.
    const olderTxns = applyPending({ ...payload, txns: older.txns }, pending).txns.filter((t) => t.postedOn < since && t.postedOn >= older.from && t.postedOn <= older.to);
    return [...inWindow, ...olderTxns];
  }, [payload, since, needOlder, older, pending]);
  return {
    txns,
    loadingOlder: needOlder && !older && !query.isError,
    olderFailed: needOlder && query.isError && !older,
    truncated: needOlder && (older?.truncated ?? false),
  };
}

/** The owner's calendar day (V27), moving at midnight in their zone. */
export function useToday(timeZone: string): Day {
  const now = useNow(60_000);
  return todayIn(timeZone, now === null ? new Date() : new Date(now));
}

/** A new manual txn from what the form or the palette gathered: fresh id, entered now. */
export function newTxn(fields: Pick<Txn, "accountId" | "postedOn" | "amountMinor" | "currency" | "payee" | "categoryId" | "tags">): Txn {
  return { ...fields, id: crypto.randomUUID(), note: "", source: "manual", transferId: null, createdAt: Date.now() };
}

/** Whether this device has seen the txn before: an edit, not a new entry. */
function known(qc: QueryClient, id: string): boolean {
  if (id in useMoneyLocal.getState().txns) return true;
  if (qc.getQueryData<MoneyPayload>(MONEY_KEY)?.txns.some((t) => t.id === id)) return true;
  return qc.getQueriesData<TxnRangePayload>({ queryKey: [MONEY_RANGE_KEY] }).some(([, d]) => d?.txns.some((t) => t.id === id) ?? false);
}

/**
 * A new entry with the owner's rules applied (FR-MONEY-13): the first match
 * sets the category when none was picked, and adds its tags. Edits are left
 * as the owner made them.
 */
function withRules(qc: QueryClient, txn: Txn): Txn {
  if (known(qc, txn.id)) return txn;
  const payload = qc.getQueryData<MoneyPayload>(MONEY_KEY);
  const rules = payload?.rules;
  if (!payload || !rules || rules.length === 0) return txn;
  const pendingRules = useMoneyLocal.getState().rules;
  const live = applyPendingPlans(payload, {}, pendingRules).rules ?? rules;
  const open = new Set(payload.categories.filter((c) => !c.archived).map((c) => c.id));
  return applyRules(txn, live, (id) => open.has(id));
}

export function useMoneyApi() {
  const runtime = useMoneyRuntime();
  const qc = useQueryClient();

  /** Shows at once; the outbox sends it when it can (V24, V28). A newer write to the same id takes over. */
  const save = React.useCallback(
    (txn: Txn) => {
      rememberAccount(txn.accountId);
      runtime.saveTxn(withRules(qc, txn));
    },
    [runtime, qc],
  );

  /** A category named in the form: shown at once, queued ahead of the txn that uses it. */
  const saveCategory = React.useCallback(
    (category: Category) => {
      runtime.saveCategory(category);
    },
    [runtime],
  );

  /**
   * Deletes with an undo (user 2026-11-05: destructive actions get a confirm
   * or an undo). The row hides at once; Undo or × brings it back, and the
   * delete is queued only when the toast runs out (timed out or pushed out),
   * so nothing on the server ever has to be resurrected.
   */
  const remove = React.useCallback(
    (txn: Txn) => {
      const before = runtime.hideTxn(txn.id);
      const cancel = () => {
        runtime.unhideTxn(txn.id, before);
      };
      toast({
        id: `undo-delete:${txn.id}`,
        title: `Deleted ${describeTxn(txn)}`,
        action: { label: "Undo", onClick: cancel },
        // Closing the toast cancels too: only running out commits (user 2026-11-05).
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          runtime.deleteTxn(txn);
        },
      });
    },
    [runtime],
  );

  return { save, remove, saveCategory };
}

/**
 * Account writes (FR-MONEY-1): shown at once, then queued behind every money
 * write before them, so a txn on a new account always lands after it.
 */
export function useAccountApi() {
  const runtime = useMoneyRuntime();

  /** Creates or edits an account. The currency is only used on create. */
  const save = React.useCallback(
    (account: Account) => {
      runtime.saveAccount(account);
    },
    [runtime],
  );

  /** Archives at once, with an Undo (user rule: anything that takes a thing away gets an undo). */
  const setArchived = React.useCallback(
    (account: Account, archived: boolean) => {
      runtime.archiveAccount({ ...account, archived });
      if (!archived) return;
      toast({
        id: `undo-archive:${account.id}`,
        title: `Archived ${account.name}`,
        body: "Its entries and balance stay. New entries can't use it.",
        action: {
          label: "Undo",
          onClick: () => {
            runtime.archiveAccount({ ...account, archived: false });
          },
        },
      });
    },
    [runtime],
  );

  return { save, setArchived };
}

/**
 * Subscription writes (FR-MONEY-8): shown at once, then queued behind every
 * money write before them, so one on a new account lands after it. Taking
 * one away (delete, cancel) comes with an Undo (user rule, 2026-11-05).
 */
export function useSubscriptionApi() {
  const runtime = useMoneyRuntime();

  const save = React.useCallback(
    (sub: Subscription) => {
      runtime.saveSubscription(sub);
    },
    [runtime],
  );

  /** Hides at once; the delete is queued only when the toast runs out. Undo or × brings it back. */
  const remove = React.useCallback(
    (sub: Subscription) => {
      const before = runtime.hideSubscription(sub.id);
      const cancel = () => {
        runtime.unhideSubscription(sub.id, before);
      };
      toast({
        id: `undo-delete-sub:${sub.id}`,
        title: `Deleted ${sub.name}`,
        action: { label: "Undo", onClick: cancel },
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          runtime.deleteSubscription(sub);
        },
      });
    },
    [runtime],
  );

  /** Pause, resume or cancel. Cancelling says so with an Undo back to how it was. */
  const setStatus = React.useCallback(
    (sub: Subscription, status: Subscription["status"]) => {
      runtime.saveSubscription({ ...sub, status });
      if (status !== "cancelled") return;
      toast({
        id: `undo-cancel-sub:${sub.id}`,
        title: `Cancelled ${sub.name}`,
        body: "Kept in the list, with no more renewals or reminders.",
        action: {
          label: "Undo",
          onClick: () => {
            runtime.saveSubscription(sub);
          },
        },
      });
    },
    [runtime],
  );

  return { save, remove, setStatus };
}

/**
 * The palette's "New subscription": a request the subscriptions page picks
 * up, whether it is already open or mounts after the hop, then clears.
 */
export const useNewSubscription = create<{ asked: boolean; ask: () => void; clear: () => void }>((set) => ({
  asked: false,
  ask: () => {
    set({ asked: true });
  },
  clear: () => {
    set({ asked: false });
  },
}));

/** How long rates stay fresh: they change once a day. */
const FX_STALE_MS = 6 * 60 * 60 * 1000;

/**
 * FX rates from `from` to today (FR-MONEY-14), as a lookup table. Its own
 * cache, so the money page never waits on it (V24): until it lands, other
 * currencies show apart, as with no rate (V26). While the server is still
 * filling older days it asks again every few seconds.
 */
export function useFx(from: Day, options: { enabled?: boolean } = {}): { table: FxTable; loading: boolean } {
  const query = useQuery({
    queryKey: [FX_KEY, from],
    queryFn: () => fetchJson<FxPayload>(`/api/money/fx?from=${from}`),
    staleTime: FX_STALE_MS,
    enabled: options.enabled ?? true,
    refetchInterval: (q) => (q.state.data?.incomplete ? 4_000 : false),
  });
  const rates = query.data?.rates;
  const table = React.useMemo(() => new FxTable(rates ?? []), [rates]);
  return { table, loading: query.isPending && (options.enabled ?? true) };
}

/** The rates the money window needs: from the month before it (rollover reads last month too). */
export function windowFxFrom(payload: Pick<MoneyPayload, "since">): Day {
  return addMonths(startOfMonth(payload.since), -1);
}

/** Budget writes (FR-MONEY-7): shown at once, queued like every money write. Delete has an Undo. */
export function useBudgetApi() {
  const runtime = useMoneyRuntime();
  const save = React.useCallback(
    (b: Budget) => {
      runtime.saveBudget(b);
    },
    [runtime],
  );
  const remove = React.useCallback(
    (b: Budget, name: string) => {
      const before = runtime.hideRow("budgets", b.id);
      const cancel = () => {
        runtime.unhideRow("budgets", b.id, before);
      };
      toast({
        id: `undo-delete-budget:${b.id}`,
        title: `Deleted the ${name} budget`,
        action: { label: "Undo", onClick: cancel },
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          runtime.deleteBudget(b);
        },
      });
    },
    [runtime],
  );
  return { save, remove };
}

/** Rule writes (FR-MONEY-13), like budgets. */
export function useRuleApi() {
  const runtime = useMoneyRuntime();
  const save = React.useCallback(
    (r: Rule) => {
      runtime.saveRule(r);
    },
    [runtime],
  );
  const remove = React.useCallback(
    (r: Rule) => {
      const before = runtime.hideRow("rules", r.id);
      const cancel = () => {
        runtime.unhideRow("rules", r.id, before);
      };
      toast({
        id: `undo-delete-rule:${r.id}`,
        title: `Deleted the rule for "${r.payeeContains}"`,
        action: { label: "Undo", onClick: cancel },
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          runtime.deleteRule(r);
        },
      });
    },
    [runtime],
  );
  return { save, remove };
}
