"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { useNow } from "@/hooks/use-now";
import { fetchJson } from "@/lib/fetch-json";
import { todayIn, type Day } from "@/lib/money/dates";
import { olderRange } from "@/lib/money/periods";
import { MONEY_KEY, MONEY_RANGE_KEY, applyPending, applyPendingAccounts, type Account, type MoneyPayload, type Txn, type TxnRangePayload } from "@/lib/money/money";
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
  const data = React.useMemo(
    () => (query.data ? applyPendingAccounts(applyPending(query.data, pending), accounts) : null),
    [query.data, pending, accounts],
  );
  return { data, failed: query.isError && !query.data, refetch: query.refetch };
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

export function useMoneyApi() {
  const runtime = useMoneyRuntime();

  /** Shows at once; the outbox sends it when it can (V24, V28). A newer write to the same id takes over. */
  const save = React.useCallback(
    (txn: Txn) => {
      rememberAccount(txn.accountId);
      runtime.saveTxn(txn);
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

  return { save, remove };
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
