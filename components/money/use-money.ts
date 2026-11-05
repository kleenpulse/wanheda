"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { deleteTxn, saveTxn } from "@/actions/money";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { useNow } from "@/hooks/use-now";
import { createTxnWriter } from "./txn-writer";
import { fetchJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money/currency";
import { todayIn, type Day } from "@/lib/money/dates";
import {
  MONEY_KEY,
  applyPending,
  removeTxn,
  upsertTxn,
  type MoneyPayload,
  type PendingTxns,
  type Txn,
} from "@/lib/money/money";

// The money cache (V24): every money view reads one TanStack Query entry,
// filled by the page's Prefetch or by /api/money, with this device's
// unconfirmed writes laid over it. Writes show at once; a write the server
// cannot take yet is retried a few times, then reported and dropped. Writes
// to one id never race: see txn-writer.ts.
// Nothing here is queued across reloads yet (no money outbox in Phase 3 CP1).

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
      qc.setQueryData<MoneyPayload>(MONEY_KEY, (prev) => (prev ? fn(prev) : prev));
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
      const outcome = await writer.save(txn, writeCache);
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
    [demo, writeCache],
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
          void writer.remove(txn, writeCache).then((outcome) => {
            if (!outcome.ok && outcome.reason !== "superseded") toast({ title: `Not deleted: ${describe(txn)}`, body: "The server didn't answer. Try again." });
          });
        },
      });
    },
    [demo, writeCache],
  );

  return { save, remove };
}
