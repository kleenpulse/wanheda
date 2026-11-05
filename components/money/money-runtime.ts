import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { archiveAccount, deleteTxn, saveAccount, saveTxn } from "@/actions/money";
import { toast } from "@/components/ui/toaster";
import { formatMoney } from "@/lib/money/currency";
import {
  MONEY_KEY,
  MONEY_RANGE_KEY,
  removeTxn,
  upsertAccount,
  upsertTxn,
  writeOf,
  type Account,
  type MoneyPayload,
  type PendingAccounts,
  type PendingTxns,
  type Txn,
  type TxnRangePayload,
} from "@/lib/money/money";
import {
  MemoryMoneyStore,
  MoneyOutbox,
  txnKey,
  type AccountWriteResult,
  type MoneyEvent,
  type MoneyOp,
  type MoneyOutboxOptions,
  type MoneyQueueStore,
  type MoneyResult,
  type MoneyWrite,
  type TxnDeleteResult,
  type TxnSaveResult,
} from "@/lib/money/outbox";

/*
  Money writes on the client (ADR-0008, SPEC V28). A write shows at once
  through an overlay of unconfirmed writes laid over the money cache (V24),
  and goes into the device outbox (lib/money/outbox.ts), which sends it when
  it can, however long that takes. The overlay entry stays until the server
  has answered the last queued op for that id, so a refetch can never roll a
  write back. Every tab folds answered ops into its own cache; tabs share the
  queue and tell each other what was queued and what landed. Lives in the
  shell, so the palette can add from any page and the queue drains from any
  page.
*/

const SYNC_MS = 30_000;
const CHANNEL = "wanheda-money";
const LOCK = "wanheda-money-outbox";

interface MoneyLocal {
  /** Txn writes not yet confirmed: the txn to show, or null for one deleted here. */
  txns: PendingTxns;
  accounts: PendingAccounts;
  /** Ops waiting in the outbox, across tabs. */
  queued: number;
}

export const useMoneyLocal = create<MoneyLocal>(() => ({ txns: {}, accounts: {}, queued: 0 }));

function setPendingTxn(id: string, txn: Txn | null) {
  useMoneyLocal.setState((s) => ({ txns: { ...s.txns, [id]: txn } }));
}

function clearPendingTxn(id: string) {
  useMoneyLocal.setState((s) => {
    if (!(id in s.txns)) return s;
    const { [id]: _gone, ...rest } = s.txns;
    return { txns: rest };
  });
}

function setPendingAccount(account: Account) {
  useMoneyLocal.setState((s) => ({ accounts: { ...s.accounts, [account.id]: account } }));
}

function clearPendingAccount(id: string) {
  useMoneyLocal.setState((s) => {
    if (!(id in s.accounts)) return s;
    const { [id]: _gone, ...rest } = s.accounts;
    return { accounts: rest };
  });
}

/** How a txn is named in a toast: "₦4,500 · jollof". */
export function describeTxn(t: Txn): string {
  const amount = formatMoney({ minor: t.amountMinor, currency: t.currency }, { sign: "never" });
  return t.payee ? `${amount} · ${t.payee}` : amount;
}

/** Sends one op through its server action. A thrown request counts as failed. */
function sendOp(op: MoneyOp): Promise<MoneyResult> {
  switch (op.kind) {
    case "txn-save":
      return saveTxn(writeOf(op.txn));
    case "txn-delete":
      return deleteTxn({ id: op.txn.id });
    case "account-save": {
      const a = op.account;
      return saveAccount({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, openingMinor: a.openingMinor });
    }
    case "account-archive":
      return archiveAccount({ id: op.account.id, archived: op.account.archived });
  }
}

function openStore(demo: boolean): Promise<MoneyQueueStore> {
  if (demo || typeof indexedDB === "undefined") return Promise.resolve(new MemoryMoneyStore());
  return import("@/lib/money/local-store")
    .then((m) => m.openMoneyStore())
    .catch((error: unknown) => {
      console.error("money: IndexedDB unavailable, keeping writes in memory", error);
      return new MemoryMoneyStore();
    });
}

function withLock<T>(run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) return navigator.locks.request(LOCK, run);
  return run();
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

type ChannelMessage = { t: "queued"; write: MoneyWrite } | { t: "event"; event: MoneyEvent } | { t: "change" };

export interface MoneyRuntime {
  saveTxn: (txn: Txn) => void;
  /** Hides a row while its undo toast runs. Returns what was shown, for `unhideTxn`. */
  hideTxn: (id: string) => Txn | null | undefined;
  /** Undo: shows the row again as it was before `hideTxn`. */
  unhideTxn: (id: string, before: Txn | null | undefined) => void;
  /** The undo window ran out: the delete is queued (behind any save of the txn still on its way). */
  deleteTxn: (txn: Txn) => void;
  saveAccount: (account: Account) => void;
  /** `account.archived` is the state wanted. */
  archiveAccount: (account: Account) => void;
  /** Wires the outbox to this tab: boot from the device, listeners, sync ticks. Returns the cleanup. */
  start: () => () => void;
  /** Shows what is still queued on this device and resumes sending (part of `start`). */
  boot: () => Promise<void>;
  /** For tests: the outbox itself. */
  outbox: MoneyOutbox;
}

export function createMoneyRuntime(qc: QueryClient, demo: boolean, overrides: Partial<MoneyOutboxOptions> = {}): MoneyRuntime {
  let channel: BroadcastChannel | null = null;
  const post = (message: ChannelMessage) => {
    channel?.postMessage(message);
  };

  /** Writes into the money cache and the older-period caches (an upsert or a remove touches the same rows). */
  const writeCache = (fn: (p: MoneyPayload) => MoneyPayload) => {
    const main = qc.getQueryData<MoneyPayload>(MONEY_KEY);
    qc.setQueryData<MoneyPayload>(MONEY_KEY, (prev) => (prev ? fn(prev) : prev));
    if (main) {
      qc.setQueriesData<TxnRangePayload>({ queryKey: [MONEY_RANGE_KEY] }, (prev) => (prev ? { ...prev, txns: fn({ ...main, txns: prev.txns }).txns } : prev));
    }
  };

  // Server truth goes into the cache before the overlay entry is dropped. A
  // refetch already in flight was asked before this write landed and would
  // put the old rows back, so it is cancelled first (only once there is data:
  // cancelling a first load would leave the page waiting).
  const confirm = async (fn: (p: MoneyPayload) => MoneyPayload, then: () => void) => {
    if (qc.getQueryData(MONEY_KEY)) await qc.cancelQueries({ queryKey: MONEY_KEY, exact: true });
    writeCache(fn);
    then();
  };

  /**
   * Whether a write moves money before the window, whose per-account sums the
   * server holds: then the window is refetched so balances stay true.
   */
  const touchesPrior = (txn: Txn) => {
    const since = qc.getQueryData<MoneyPayload>(MONEY_KEY)?.since;
    if (!since) return false;
    if (txn.postedOn < since) return true;
    return qc
      .getQueriesData<TxnRangePayload>({ queryKey: [MONEY_RANGE_KEY] })
      .some(([, d]) => d?.txns.some((t) => t.id === txn.id && t.postedOn < since) ?? false);
  };

  const refetchWindow = () => void qc.invalidateQueries({ queryKey: MONEY_KEY, exact: true });

  /**
   * Drops a txn's overlay entry once nothing more is queued for it, but only
   * the kind this op settles: a save never brings back a row hidden by a
   * running undo toast, and a delete never drops a newer save's row.
   */
  const settleTxn = (id: string, more: boolean, deleting: boolean) => {
    if (more) return;
    const shown = useMoneyLocal.getState().txns[id];
    if (shown === undefined) return;
    if (deleting ? shown === null : shown !== null) clearPendingTxn(id);
  };

  /** What an answered op means for this tab's view. Runs in every tab; only the sender's tab speaks. */
  const applyEvent = (event: MoneyEvent, local: boolean) => {
    const { op, more } = event;
    if (op.kind === "txn-save") {
      const result = event.result as TxnSaveResult;
      const id = op.txn.id;
      if (result.ok) {
        const prior = touchesPrior(op.txn);
        const saved = result.txn;
        void confirm(
          (p) => upsertTxn(p, saved),
          () => {
            settleTxn(id, more, false);
            if (prior) refetchWindow();
          },
        );
        return;
      }
      settleTxn(id, more, false);
      if (local) {
        toast({
          title: `Not saved: ${describeTxn(op.txn)}`,
          body: result.reason === "archived-account" ? "That account is archived. Pick another one." : "The server refused it. Reload and try again.",
        });
      }
      return;
    }
    if (op.kind === "txn-delete") {
      const result = event.result as TxnDeleteResult;
      const id = op.txn.id;
      if (result.ok) {
        const prior = touchesPrior(op.txn);
        void confirm(
          (p) => removeTxn(p, id),
          () => {
            settleTxn(id, more, true);
            if (prior) refetchWindow();
          },
        );
        return;
      }
      settleTxn(id, more, true);
      if (local) toast({ title: `Not deleted: ${describeTxn(op.txn)}`, body: "The server refused it. Reload and try again." });
      return;
    }
    const result = event.result as AccountWriteResult;
    const id = op.account.id;
    if (result.ok) {
      const saved = result.account;
      void confirm(
        (p) => upsertAccount(p, saved),
        () => {
          if (!more) clearPendingAccount(id);
        },
      );
      return;
    }
    if (!more) clearPendingAccount(id);
    if (local) {
      const verb = op.kind === "account-save" ? "saved" : op.account.archived ? "archived" : "restored";
      toast({ title: `Not ${verb}: ${op.account.name}`, body: "The server refused it. Reload and try again." });
    }
    refetchWindow();
  };

  const store = overrides.store ?? openStore(demo);

  const refreshCount = async () => {
    useMoneyLocal.setState({ queued: await outbox.count() });
  };

  const outbox = new MoneyOutbox({
    store,
    send: sendOp,
    onEvent: (event) => {
      applyEvent(event, true);
      post({ t: "event", event });
    },
    onChange: () => {
      void refreshCount();
      post({ t: "change" });
    },
    online: isOnline,
    lock: withLock,
    ...overrides,
  });

  /** What a queued write shows until it lands: in this tab, in other tabs, and after a reload. */
  const overlay = (w: MoneyWrite) => {
    if (w.kind === "txn-save") setPendingTxn(w.txn.id, w.txn);
    else if (w.kind === "txn-delete") setPendingTxn(w.txn.id, null);
    else setPendingAccount(w.account);
  };

  /** Shows the write, then queues it. If the device can't store it, takes it back and says so. */
  const enqueue = (w: MoneyWrite) => {
    overlay(w);
    void outbox.enqueue(w).then((stored) => {
      if (stored) {
        post({ t: "queued", write: w });
        return;
      }
      if (w.kind === "txn-save" || w.kind === "txn-delete") clearPendingTxn(w.txn.id);
      else clearPendingAccount(w.account.id);
      const what = w.kind === "txn-save" || w.kind === "txn-delete" ? describeTxn(w.txn) : w.account.name;
      toast({ title: `Not ${w.kind === "txn-delete" ? "deleted" : "saved"}: ${what}`, body: "This device couldn't keep it. Try again." });
    });
  };

  /** After a reload: writes still queued show on top of the cache until they land, and sending resumes. */
  const boot = async (stopped: () => boolean = () => false) => {
    const ops = await outbox.pending().catch(() => []);
    if (stopped()) return;
    for (const op of ops) overlay(op);
    await refreshCount();
    void outbox.flush();
  };

  const start = () => {
    if (demo) return () => undefined;
    const life = { stopped: false };
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    if (channel) {
      channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
        const m = e.data;
        if (m.t === "queued") overlay(m.write);
        else if (m.t === "event") applyEvent(m.event, false);
        else void refreshCount();
      };
    }

    void boot(() => life.stopped);

    const flush = () => void outbox.flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(flush, SYNC_MS);

    return () => {
      life.stopped = true;
      clearInterval(tick);
      window.removeEventListener("online", flush);
      window.removeEventListener("focus", flush);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
      channel = null;
    };
  };

  return {
    saveTxn(txn) {
      if (demo) {
        writeCache((p) => upsertTxn(p, txn));
        return;
      }
      enqueue({ kind: "txn-save", txn });
    },
    hideTxn(id) {
      const before = useMoneyLocal.getState().txns[id];
      setPendingTxn(id, null);
      return before;
    },
    unhideTxn(id, before) {
      if (!before) {
        clearPendingTxn(id);
        return;
      }
      // A save of it may still be queued: show the local copy until it lands.
      // If it already landed (its answer left the row hidden), the cache has it.
      setPendingTxn(id, before);
      void outbox.has(txnKey(id)).then((queued) => {
        if (!queued && useMoneyLocal.getState().txns[id] === before) clearPendingTxn(id);
      });
    },
    deleteTxn(txn) {
      if (demo) {
        writeCache((p) => removeTxn(p, txn.id));
        clearPendingTxn(txn.id);
        return;
      }
      enqueue({ kind: "txn-delete", txn });
    },
    saveAccount(account) {
      if (demo) {
        writeCache((p) => upsertAccount(p, account));
        return;
      }
      enqueue({ kind: "account-save", account });
    },
    archiveAccount(account) {
      if (demo) {
        writeCache((p) => upsertAccount(p, account));
        return;
      }
      enqueue({ kind: "account-archive", account });
    },
    start,
    boot: () => boot(),
    outbox,
  };
}
