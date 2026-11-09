import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { archiveAccount, deleteSubscription, deleteTxn, saveAccount, saveCategory, saveSubscription, saveTxn } from "@/actions/money";
import { deleteBudget, deleteRule, saveBudget, saveRule } from "@/actions/plans";
import { queueOwner } from "@/lib/device/scope";
import { toast } from "@/components/ui/toaster";
import { budgetWriteOf, upsertBudgetIn, type Budget } from "@/lib/money/budgets";
import { formatMoney } from "@/lib/money/currency";
import {
  MONEY_KEY,
  MONEY_RANGE_KEY,
  removeSubscription,
  removeTxn,
  categoryWriteOf,
  upsertAccount,
  upsertCategory,
  upsertSubscription,
  upsertTxn,
  writeOf,
  type Account,
  type Category,
  type MoneyPayload,
  type PendingAccounts,
  type PendingBudgets,
  type PendingCategories,
  type PendingRules,
  type PendingSubscriptions,
  type PendingTxns,
  type Txn,
  type TxnRangePayload,
} from "@/lib/money/money";
import { ruleWriteOf, upsertRuleIn, type Rule } from "@/lib/money/rules";
import { subscriptionWriteOf, type Subscription } from "@/lib/money/subscriptions";
import { pushNotices } from "@/lib/notifications/inbox";
import {
  budgetKey,
  MemoryMoneyStore,
  MoneyOutbox,
  ruleKey,
  subKey,
  txnKey,
  type AccountWriteResult,
  type BudgetSaveResult,
  type CategorySaveResult,
  type MoneyEvent,
  type MoneyOp,
  type MoneyOutboxOptions,
  type MoneyQueueStore,
  type MoneyResult,
  type MoneyWrite,
  type PlanDeleteResult,
  type RuleSaveResult,
  type SubDeleteResult,
  type SubSaveResult,
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
  /** Subscription writes not yet confirmed, like `txns`. */
  subs: PendingSubscriptions;
  budgets: PendingBudgets;
  rules: PendingRules;
  categories: PendingCategories;
  /** Ops waiting in the outbox, across tabs. */
  queued: number;
}

export const useMoneyLocal = create<MoneyLocal>(() => ({ txns: {}, accounts: {}, subs: {}, budgets: {}, rules: {}, categories: {}, queued: 0 }));

/** The overlays of whole rows: txns, subscriptions, budgets and rules share their rules. */
export type RowLayer = "txns" | "subs" | "budgets" | "rules";
type Row = Txn | Subscription | Budget | Rule;

function setPendingRow(layer: RowLayer, id: string, row: Row | null) {
  useMoneyLocal.setState((s) => ({ [layer]: { ...s[layer], [id]: row } }));
}

function clearPendingRow(layer: RowLayer, id: string) {
  useMoneyLocal.setState((s) => {
    if (!(id in s[layer])) return s;
    const { [id]: _gone, ...rest } = s[layer];
    return { [layer]: rest };
  });
}

function setPendingTxn(id: string, txn: Txn | null) {
  setPendingRow("txns", id, txn);
}

function clearPendingTxn(id: string) {
  clearPendingRow("txns", id);
}

function setPendingAccount(account: Account) {
  useMoneyLocal.setState((s) => ({ accounts: { ...s.accounts, [account.id]: account } }));
}

function setPendingCategory(c: Category) {
  useMoneyLocal.setState((s) => ({ categories: { ...s.categories, [c.id]: c } }));
}

function clearPendingCategory(id: string) {
  useMoneyLocal.setState((s) => {
    if (!(id in s.categories)) return s;
    const { [id]: _gone, ...rest } = s.categories;
    return { categories: rest };
  });
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

/** How a subscription is named in a toast. */
function describeSub(s: Subscription): string {
  return s.name || "subscription";
}

/** How a budget or a rule is named in a toast. */
function describePlan(w: { budget: Budget } | { rule: Rule }): string {
  return "rule" in w ? `rule "${w.rule.payeeContains}"` : "budget";
}

/** Sends one op through its server action. A thrown request counts as failed. */
/** Each replayed write carries the account whose store queued it (V78). */
function sendOp(op: MoneyOp): Promise<MoneyResult> {
  const asUser = queueOwner();
  switch (op.kind) {
    case "category-save":
      return saveCategory(categoryWriteOf(op.category), asUser);
    case "budget-save":
      return saveBudget(budgetWriteOf(op.budget), asUser);
    case "budget-delete":
      return deleteBudget({ id: op.budget.id }, asUser);
    case "rule-save":
      return saveRule(ruleWriteOf(op.rule), asUser);
    case "rule-delete":
      return deleteRule({ id: op.rule.id }, asUser);
    case "sub-save":
      return saveSubscription(subscriptionWriteOf(op.subscription), asUser);
    case "sub-delete":
      return deleteSubscription({ id: op.subscription.id }, asUser);
    case "txn-save":
      return saveTxn(writeOf(op.txn), asUser);
    case "txn-delete":
      return deleteTxn({ id: op.txn.id }, asUser);
    case "account-save": {
      const a = op.account;
      return saveAccount({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, openingMinor: a.openingMinor }, asUser);
    }
    case "account-archive":
      return archiveAccount({ id: op.account.id, archived: op.account.archived }, asUser);
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
  saveSubscription: (sub: Subscription) => void;
  /** A category named in the form. Queued before the txn that uses it, so it lands first. */
  saveCategory: (category: Category) => void;
  saveBudget: (budget: Budget) => void;
  /** The undo window ran out: the delete is queued. */
  deleteBudget: (budget: Budget) => void;
  saveRule: (rule: Rule) => void;
  deleteRule: (rule: Rule) => void;
  /** Hides a budget or rule while its undo toast runs. Returns what was shown, for `unhideRow`. */
  hideRow: (layer: "budgets" | "rules", id: string) => Budget | Rule | null | undefined;
  unhideRow: (layer: "budgets" | "rules", id: string, before: Budget | Rule | null | undefined) => void;
  /** Like `hideTxn`, for a subscription's undo toast. */
  hideSubscription: (id: string) => Subscription | null | undefined;
  unhideSubscription: (id: string, before: Subscription | null | undefined) => void;
  /** The undo window ran out: the delete is queued. */
  deleteSubscription: (sub: Subscription) => void;
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
  const settleRow = (layer: RowLayer, id: string, more: boolean, deleting: boolean) => {
    if (more) return;
    const shown = useMoneyLocal.getState()[layer][id];
    if (shown === undefined) return;
    if (deleting ? shown === null : shown !== null) clearPendingRow(layer, id);
  };
  const settleTxn = (id: string, more: boolean, deleting: boolean) => {
    settleRow("txns", id, more, deleting);
  };

  /** What an answered op means for this tab's view. Runs in every tab; only the sender's tab speaks. */
  const applyEvent = (event: MoneyEvent, local: boolean) => {
    const { op, more } = event;
    if (op.kind === "category-save") {
      const result = event.result as CategorySaveResult;
      const id = op.category.id;
      if (result.ok) {
        const saved = result.category;
        void confirm(
          (p) => upsertCategory(p, saved),
          () => {
            if (!more) clearPendingCategory(id);
          },
        );
        return;
      }
      if (!more) clearPendingCategory(id);
      if (local) {
        // Entries still waiting with it fall back to no category, so they land rather than being refused too.
        for (const t of Object.values(useMoneyLocal.getState().txns)) {
          if (t?.categoryId === id) enqueue({ kind: "txn-save", txn: { ...t, categoryId: null } });
        }
        toast({ title: `Not saved: category ${op.category.name}`, body: "The server refused it. Entries that used it were kept without a category." });
      }
      return;
    }
    if (op.kind === "budget-save" || op.kind === "rule-save") {
      const layer = op.kind === "budget-save" ? "budgets" : "rules";
      const id = op.kind === "budget-save" ? op.budget.id : op.rule.id;
      const result = event.result as BudgetSaveResult | RuleSaveResult;
      if (result.ok) {
        if ("budget" in result) pushNotices(result.notices);
        void confirm(
          (p) => ("budget" in result ? { ...p, budgets: upsertBudgetIn(p.budgets ?? [], result.budget) } : { ...p, rules: upsertRuleIn(p.rules ?? [], result.rule) }),
          () => {
            settleRow(layer, id, more, false);
          },
        );
        return;
      }
      settleRow(layer, id, more, false);
      if (local) {
        toast({
          title: `Not saved: ${describePlan(op)}`,
          body: result.reason === "taken" ? "That category already has a budget. Edit that one instead." : "The server refused it. Reload and try again.",
        });
      }
      return;
    }
    if (op.kind === "budget-delete" || op.kind === "rule-delete") {
      const layer = op.kind === "budget-delete" ? "budgets" : "rules";
      const id = op.kind === "budget-delete" ? op.budget.id : op.rule.id;
      const result = event.result as PlanDeleteResult;
      if (result.ok) {
        void confirm(
          (p) => (layer === "budgets" ? { ...p, budgets: (p.budgets ?? []).filter((b) => b.id !== id) } : { ...p, rules: (p.rules ?? []).filter((r) => r.id !== id) }),
          () => {
            settleRow(layer, id, more, true);
          },
        );
        return;
      }
      settleRow(layer, id, more, true);
      if (local) toast({ title: `Not deleted: ${describePlan(op)}`, body: "The server refused it. Reload and try again." });
      return;
    }
    if (op.kind === "sub-save") {
      const result = event.result as SubSaveResult;
      const id = op.subscription.id;
      if (result.ok) {
        const saved = result.subscription;
        // Every tab has its own centre, so each one takes the reminders.
        pushNotices(result.notices);
        void confirm(
          (p) => upsertSubscription(p, saved),
          () => {
            settleRow("subs", id, more, false);
          },
        );
        return;
      }
      settleRow("subs", id, more, false);
      if (local) toast({ title: `Not saved: ${describeSub(op.subscription)}`, body: "The server refused it. Reload and try again." });
      return;
    }
    if (op.kind === "sub-delete") {
      const result = event.result as SubDeleteResult;
      const id = op.subscription.id;
      if (result.ok) {
        void confirm(
          (p) => removeSubscription(p, id),
          () => {
            settleRow("subs", id, more, true);
          },
        );
        return;
      }
      settleRow("subs", id, more, true);
      if (local) toast({ title: `Not deleted: ${describeSub(op.subscription)}`, body: "The server refused it. Reload and try again." });
      return;
    }
    if (op.kind === "txn-save") {
      const result = event.result as TxnSaveResult;
      const id = op.txn.id;
      if (result.ok) {
        const prior = touchesPrior(op.txn);
        const saved = result.txn;
        if (result.notices) pushNotices(result.notices);
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
    else if (w.kind === "sub-save") setPendingRow("subs", w.subscription.id, w.subscription);
    else if (w.kind === "sub-delete") setPendingRow("subs", w.subscription.id, null);
    else if (w.kind === "category-save") setPendingCategory(w.category);
    else if (w.kind === "budget-save") setPendingRow("budgets", w.budget.id, w.budget);
    else if (w.kind === "budget-delete") setPendingRow("budgets", w.budget.id, null);
    else if (w.kind === "rule-save") setPendingRow("rules", w.rule.id, w.rule);
    else if (w.kind === "rule-delete") setPendingRow("rules", w.rule.id, null);
    else setPendingAccount(w.account);
  };

  /** What a write is called in a toast, and how to take its overlay entry back when it can't be stored. */
  const describeWrite = (w: MoneyWrite): { what: string; drop: () => void } => {
    switch (w.kind) {
      case "txn-save":
      case "txn-delete":
        return {
          what: describeTxn(w.txn),
          drop: () => {
            clearPendingTxn(w.txn.id);
          },
        };
      case "sub-save":
      case "sub-delete":
        return {
          what: describeSub(w.subscription),
          drop: () => {
            clearPendingRow("subs", w.subscription.id);
          },
        };
      case "category-save":
        return {
          what: `category ${w.category.name}`,
          drop: () => {
            clearPendingCategory(w.category.id);
          },
        };
      case "budget-save":
      case "budget-delete":
        return {
          what: describePlan(w),
          drop: () => {
            clearPendingRow("budgets", w.budget.id);
          },
        };
      case "rule-save":
      case "rule-delete":
        return {
          what: describePlan(w),
          drop: () => {
            clearPendingRow("rules", w.rule.id);
          },
        };
      case "account-save":
      case "account-archive":
        return {
          what: w.account.name,
          drop: () => {
            clearPendingAccount(w.account.id);
          },
        };
    }
  };

  /** Shows the write, then queues it. If the device can't store it, takes it back and says so. */
  const enqueue = (w: MoneyWrite) => {
    overlay(w);
    void outbox.enqueue(w).then((stored) => {
      if (stored) {
        post({ t: "queued", write: w });
        return;
      }
      const { what, drop } = describeWrite(w);
      drop();
      const deleting = w.kind.endsWith("-delete");
      toast({ title: `Not ${deleting ? "deleted" : "saved"}: ${what}`, body: "This device couldn't keep it. Try again." });
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

  /** Undo: shows the row again. A save of it may still be queued: its local copy shows until it lands. */
  const unhideRow = (layer: RowLayer, key: string, id: string, before: Row | null | undefined) => {
    if (!before) {
      clearPendingRow(layer, id);
      return;
    }
    // If it already landed (its answer left the row hidden), the cache has it.
    setPendingRow(layer, id, before);
    void outbox.has(key).then((queued) => {
      if (!queued && useMoneyLocal.getState()[layer][id] === before) clearPendingRow(layer, id);
    });
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
      unhideRow("txns", txnKey(id), id, before);
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
    saveSubscription(sub) {
      if (demo) {
        writeCache((p) => upsertSubscription(p, sub));
        return;
      }
      enqueue({ kind: "sub-save", subscription: sub });
    },
    hideSubscription(id) {
      const before = useMoneyLocal.getState().subs[id];
      setPendingRow("subs", id, null);
      return before;
    },
    unhideSubscription(id, before) {
      unhideRow("subs", subKey(id), id, before);
    },
    deleteSubscription(sub) {
      if (demo) {
        writeCache((p) => removeSubscription(p, sub.id));
        clearPendingRow("subs", sub.id);
        return;
      }
      enqueue({ kind: "sub-delete", subscription: sub });
    },
    saveCategory(category) {
      if (demo) {
        writeCache((p) => upsertCategory(p, category));
        return;
      }
      enqueue({ kind: "category-save", category });
    },
    saveBudget(budget) {
      if (demo) {
        writeCache((p) => ({ ...p, budgets: upsertBudgetIn(p.budgets ?? [], budget) }));
        return;
      }
      enqueue({ kind: "budget-save", budget });
    },
    deleteBudget(budget) {
      if (demo) {
        writeCache((p) => ({ ...p, budgets: (p.budgets ?? []).filter((b) => b.id !== budget.id) }));
        clearPendingRow("budgets", budget.id);
        return;
      }
      enqueue({ kind: "budget-delete", budget });
    },
    saveRule(rule) {
      if (demo) {
        writeCache((p) => ({ ...p, rules: upsertRuleIn(p.rules ?? [], rule) }));
        return;
      }
      enqueue({ kind: "rule-save", rule });
    },
    deleteRule(rule) {
      if (demo) {
        writeCache((p) => ({ ...p, rules: (p.rules ?? []).filter((r) => r.id !== rule.id) }));
        clearPendingRow("rules", rule.id);
        return;
      }
      enqueue({ kind: "rule-delete", rule });
    },
    hideRow(layer, id) {
      const before = useMoneyLocal.getState()[layer][id];
      setPendingRow(layer, id, null);
      return before;
    },
    unhideRow(layer, id, before) {
      unhideRow(layer, layer === "budgets" ? budgetKey(id) : ruleKey(id), id, before);
    },
    start,
    boot: () => boot(),
    outbox,
  };
}
