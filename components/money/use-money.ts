"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { archiveAccount, deleteTxn, saveAccount, saveTxn, type AccountResult } from "@/actions/money";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { useNow } from "@/hooks/use-now";
import { createTxnWriter } from "./txn-writer";
import { fetchJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money/currency";
import { todayIn, type Day } from "@/lib/money/dates";
import { olderRange } from "@/lib/money/periods";
import {
  MONEY_KEY,
  MONEY_RANGE_KEY,
  applyPending,
  removeTxn,
  upsertAccount,
  upsertTxn,
  type Account,
  type MoneyPayload,
  type PendingTxns,
  type Txn,
  type TxnRangePayload,
} from "@/lib/money/money";

// The money cache (V24): every money view reads one TanStack Query entry,
// filled by the page's Prefetch or by /api/money, with this device's
// unconfirmed writes laid over it. Writes show at once; a write the server
// cannot take yet is retried a few times, then reported and dropped. Writes
// to one id never race: see txn-writer.ts.
// Nothing here is queued across reloads yet: the money outbox is its own checkpoint (SPEC T35b).

const usePending = create<{ pending: PendingTxns }>(() => ({ pending: {} }));

function setPending(id: string, txn: Txn | null) {
  usePending.setState((s) => ({ pending: { ...s.pending, [id]: txn } }));
}

function clearPending(id: string) {
  usePending.setState((s) => {
    const { [id]: _gone, ...rest } = s.pending;
    return { pending: rest };
  });
}

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
  const pending = usePending((s) => s.pending);
  const data = React.useMemo(() => (query.data ? applyPending(query.data, pending) : null), [query.data, pending]);
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
  const pending = usePending((s) => s.pending);
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

const writer = createTxnWriter({
  saveTxn,
  deleteTxn,
  setPending,
  clearPending,
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  retryMs: [2_000, 6_000, 15_000],
});

function describe(t: Txn): string {
  const amount = formatMoney({ minor: t.amountMinor, currency: t.currency }, { sign: "never" });
  return t.payee ? `${amount} · ${t.payee}` : amount;
}

export function useMoneyApi() {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";

  const writeCache = React.useCallback(
    (fn: (p: MoneyPayload) => MoneyPayload) => {
      const main = qc.getQueryData<MoneyPayload>(MONEY_KEY);
      qc.setQueryData<MoneyPayload>(MONEY_KEY, (prev) => (prev ? fn(prev) : prev));
      // Older periods' caches take the same write (an upsert or a remove touches txns only).
      if (main) {
        qc.setQueriesData<TxnRangePayload>({ queryKey: [MONEY_RANGE_KEY] }, (prev) => (prev ? { ...prev, txns: fn({ ...main, txns: prev.txns }).txns } : prev));
      }
    },
    [qc],
  );

  /**
   * Whether a write moves money before the window, whose per-account sums the
   * server holds: then the window is refetched so balances stay true.
   */
  const touchesPrior = React.useCallback(
    (txn: Txn) => {
      const since = qc.getQueryData<MoneyPayload>(MONEY_KEY)?.since;
      if (!since) return false;
      if (txn.postedOn < since) return true;
      return qc
        .getQueriesData<TxnRangePayload>({ queryKey: [MONEY_RANGE_KEY] })
        .some(([, d]) => d?.txns.some((t) => t.id === txn.id && t.postedOn < since) ?? false);
    },
    [qc],
  );

  /** Shows at once; the server write runs behind it (V24). A newer write to the same id takes over. */
  const save = React.useCallback(
    async (txn: Txn): Promise<boolean> => {
      rememberAccount(txn.accountId);
      if (demo) {
        writeCache((p) => upsertTxn(p, txn));
        return true;
      }
      const prior = touchesPrior(txn);
      const outcome = await writer.save(txn, writeCache);
      if (outcome.ok && prior) void qc.invalidateQueries({ queryKey: MONEY_KEY, exact: true });
      if (!outcome.ok && outcome.reason !== "superseded") {
        toast({
          title: `Not saved: ${describe(txn)}`,
          body:
            outcome.reason === "archived-account"
              ? "That account is archived. Pick another one."
              : outcome.reason === "failed"
                ? "The server didn't answer. Add it again when you're back online."
                : "The server refused it. Reload and try again.",
        });
      }
      return outcome.ok;
    },
    [demo, writeCache, touchesPrior, qc],
  );

  /**
   * Deletes with an undo (user 2026-11-05: destructive actions get a confirm
   * or an undo). The row hides at once; Undo or × brings it back, and the
   * delete is sent only when the toast runs out (timed out or pushed out), so
   * nothing on the server ever has to be resurrected.
   */
  const remove = React.useCallback(
    (txn: Txn) => {
      setPending(txn.id, null);
      const cancel = () => {
        clearPending(txn.id);
      };
      toast({
        id: `undo-delete:${txn.id}`,
        title: `Deleted ${describe(txn)}`,
        action: { label: "Undo", onClick: cancel },
        // Closing the toast cancels too: only running out commits (user 2026-11-05).
        onClose: cancel,
        closeLabel: "Cancel delete",
        onExpire: () => {
          if (demo) {
            writeCache((p) => removeTxn(p, txn.id));
            clearPending(txn.id);
            return;
          }
          const prior = touchesPrior(txn);
          void writer.remove(txn, writeCache).then((outcome) => {
            if (outcome.ok && prior) void qc.invalidateQueries({ queryKey: MONEY_KEY, exact: true });
            if (!outcome.ok && outcome.reason !== "superseded") toast({ title: `Not deleted: ${describe(txn)}`, body: "The server didn't answer. Try again." });
          });
        },
      });
    },
    [demo, writeCache, touchesPrior, qc],
  );

  return { save, remove };
}

/**
 * Account writes (FR-MONEY-1): shown at once, then sent. A failure says so and
 * refetches, which puts back what the server holds. Accounts change rarely,
 * so they skip the per-id writer txns need; a refetch in flight is cancelled
 * first so it cannot land over the optimistic row.
 */
export function useAccountApi() {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";

  const put = React.useCallback(
    (account: Account) => {
      qc.setQueryData<MoneyPayload>(MONEY_KEY, (prev) => (prev ? upsertAccount(prev, account) : prev));
    },
    [qc],
  );

  const send = React.useCallback(
    async (account: Account, run: () => Promise<AccountResult>, failTitle: string): Promise<boolean> => {
      await qc.cancelQueries({ queryKey: MONEY_KEY, exact: true });
      put(account);
      if (demo) return true;
      const result: AccountResult = await run().catch(() => ({ ok: false, reason: "failed" }));
      if (result.ok) {
        put(result.account);
        return true;
      }
      toast({
        title: failTitle,
        body: result.reason === "failed" ? "The server didn't answer. Try again when you're back online." : "The server refused it. Reload and try again.",
      });
      void qc.invalidateQueries({ queryKey: MONEY_KEY, exact: true });
      return false;
    },
    [qc, put, demo],
  );

  /** Creates or edits an account. The currency is only used on create. */
  const save = React.useCallback(
    (account: Account) =>
      send(
        account,
        () => saveAccount({ id: account.id, name: account.name, kind: account.kind, currency: account.currency, openingMinor: account.openingMinor }),
        `Not saved: ${account.name}`,
      ),
    [send],
  );

  /** Archives at once, with an Undo (user rule: anything that takes a thing away gets an undo). */
  const setArchived = React.useCallback(
    async (account: Account, archived: boolean) => {
      const verb = archived ? "archived" : "restored";
      const ok = await send({ ...account, archived }, () => archiveAccount({ id: account.id, archived }), `Not ${verb}: ${account.name}`);
      if (ok && archived) {
        toast({
          id: `undo-archive:${account.id}`,
          title: `Archived ${account.name}`,
          body: "Its entries and balance stay. New entries can't use it.",
          action: {
            label: "Undo",
            onClick: () => {
              void send({ ...account, archived: false }, () => archiveAccount({ id: account.id, archived: false }), `Not restored: ${account.name}`);
            },
          },
        });
      }
      return ok;
    },
    [send],
  );

  return { save, setArchived };
}
