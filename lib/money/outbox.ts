import type { Notice } from "@/lib/notifications/notifications";
import type { Budget } from "./budgets";
import type { Account, Category, Txn } from "./money";
import type { Rule } from "./rules";
import type { Subscription } from "./subscriptions";

/*
  The money outbox (ADR-0008, SPEC V28). Every money write (a txn saved or
  deleted, an account saved or archived, a subscription, budget or rule saved
  or deleted) is
  stored on the device first, then
  sent in order, one at a time, when the device is online: on a new write, on
  focus, on reconnect and on a 30 s tick. Nothing leaves the queue until the
  server has answered, so a phone in a dead zone or a closed tab loses no
  ledger entry. The replay is safe because every write is keyed by a client
  id: a save is an upsert, a delete of a row already gone is done, and an
  archive sets a flag.

  One queue, oldest first, for every kind together: a txn or a subscription
  made on an account created a moment before always lands after it. One op is in flight
  across tabs (a Web Lock), so a delete is never sent while a save of the
  same txn is still on its way (B13).

  Storage is behind MoneyQueueStore: IndexedDB (Dexie) for the owner, memory
  for tests and as a fallback.
*/

/** `notices`: budget alerts the save made due (V31). Optional: an op stored before T38 has none. */
export type TxnSaveResult = { ok: true; txn: Txn; notices?: Notice[] } | { ok: false; reason: "demo" | "invalid" | "archived-account" | "failed" };
export type TxnDeleteResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };
export type AccountWriteResult = { ok: true; account: Account } | { ok: false; reason: "demo" | "invalid" | "failed" };
export type CategorySaveResult = { ok: true; category: Category } | { ok: false; reason: "demo" | "invalid" | "failed" };
/** `notices`: reminders the save made due (V31), for the notification centre. */
export type SubSaveResult = { ok: true; subscription: Subscription; notices: Notice[] } | { ok: false; reason: "demo" | "invalid" | "failed" };
export type SubDeleteResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };
/** `taken`: that category (or overall) already has a budget. */
export type BudgetSaveResult = { ok: true; budget: Budget; notices: Notice[] } | { ok: false; reason: "demo" | "invalid" | "taken" | "failed" };
export type RuleSaveResult = { ok: true; rule: Rule } | { ok: false; reason: "demo" | "invalid" | "failed" };
/** A delete of a budget or a rule. */
export type PlanDeleteResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

interface OpBase {
  /** Queue order, given by the store. */
  seq?: number;
  opId: string;
  /** `txn:<id>`, `account:<id>`, `sub:<id>`, `budget:<id>` or `rule:<id>`: what the op writes. */
  key: string;
  queuedAt: number;
  /** Sent before with no answer. It may have landed, so it is resent as is, before anything after it. */
  tried: boolean;
}

export type TxnSaveOp = OpBase & { kind: "txn-save"; txn: Txn };
export type TxnDeleteOp = OpBase & { kind: "txn-delete"; txn: Txn };
export type AccountSaveOp = OpBase & { kind: "account-save"; account: Account };
/** `account.archived` is the state asked for. */
export type AccountArchiveOp = OpBase & { kind: "account-archive"; account: Account };
export type SubSaveOp = OpBase & { kind: "sub-save"; subscription: Subscription };
export type SubDeleteOp = OpBase & { kind: "sub-delete"; subscription: Subscription };
/** A category the owner names in the form. Never dropped, like account ops: a txn queued after it may use it. */
export type CategorySaveOp = OpBase & { kind: "category-save"; category: Category };
export type BudgetSaveOp = OpBase & { kind: "budget-save"; budget: Budget };
export type BudgetDeleteOp = OpBase & { kind: "budget-delete"; budget: Budget };
export type RuleSaveOp = OpBase & { kind: "rule-save"; rule: Rule };
export type RuleDeleteOp = OpBase & { kind: "rule-delete"; rule: Rule };
export type MoneyOp = TxnSaveOp | TxnDeleteOp | AccountSaveOp | AccountArchiveOp | CategorySaveOp | SubSaveOp | SubDeleteOp | BudgetSaveOp | BudgetDeleteOp | RuleSaveOp | RuleDeleteOp;

/** An op as the caller hands it in: the outbox stamps the rest. */
export type MoneyWrite =
  | { kind: "txn-save"; txn: Txn }
  | { kind: "txn-delete"; txn: Txn }
  | { kind: "account-save"; account: Account }
  | { kind: "account-archive"; account: Account }
  | { kind: "category-save"; category: Category }
  | { kind: "sub-save"; subscription: Subscription }
  | { kind: "sub-delete"; subscription: Subscription }
  | { kind: "budget-save"; budget: Budget }
  | { kind: "budget-delete"; budget: Budget }
  | { kind: "rule-save"; rule: Rule }
  | { kind: "rule-delete"; rule: Rule };

export type MoneyResult<O extends MoneyOp = MoneyOp> = O extends TxnSaveOp
  ? TxnSaveResult
  : O extends TxnDeleteOp
    ? TxnDeleteResult
    : O extends SubSaveOp
      ? SubSaveResult
      : O extends SubDeleteOp
        ? SubDeleteResult
        : O extends BudgetSaveOp
          ? BudgetSaveResult
          : O extends RuleSaveOp
            ? RuleSaveResult
            : O extends BudgetDeleteOp | RuleDeleteOp
              ? PlanDeleteResult
              : O extends CategorySaveOp
                ? CategorySaveResult
                : AccountWriteResult;

/** One answered op, for the client to fold into its view (and pass to other tabs). */
export type MoneyEvent =
  | { op: TxnSaveOp; result: TxnSaveResult; more: boolean }
  | { op: TxnDeleteOp; result: TxnDeleteResult; more: boolean }
  | { op: AccountSaveOp | AccountArchiveOp; result: AccountWriteResult; more: boolean }
  | { op: CategorySaveOp; result: CategorySaveResult; more: boolean }
  | { op: SubSaveOp; result: SubSaveResult; more: boolean }
  | { op: SubDeleteOp; result: SubDeleteResult; more: boolean }
  | { op: BudgetSaveOp; result: BudgetSaveResult; more: boolean }
  | { op: RuleSaveOp; result: RuleSaveResult; more: boolean }
  | { op: BudgetDeleteOp | RuleDeleteOp; result: PlanDeleteResult; more: boolean };

export const txnKey = (id: string) => `txn:${id}`;
export const accountKey = (id: string) => `account:${id}`;
export const subKey = (id: string) => `sub:${id}`;
export const categoryKey = (id: string) => `category:${id}`;
export const budgetKey = (id: string) => `budget:${id}`;
export const ruleKey = (id: string) => `rule:${id}`;

export function keyOf(w: MoneyWrite): string {
  switch (w.kind) {
    case "txn-save":
    case "txn-delete":
      return txnKey(w.txn.id);
    case "sub-save":
    case "sub-delete":
      return subKey(w.subscription.id);
    case "account-save":
    case "account-archive":
      return accountKey(w.account.id);
    case "category-save":
      return categoryKey(w.category.id);
    case "budget-save":
    case "budget-delete":
      return budgetKey(w.budget.id);
    case "rule-save":
    case "rule-delete":
      return ruleKey(w.rule.id);
  }
}

/** A save or delete of one row that carries the whole row: everything but accounts and categories. */
const isRowWrite = (kind: MoneyOp["kind"]) => kind !== "account-save" && kind !== "account-archive" && kind !== "category-save";
const isRowSave = (kind: MoneyOp["kind"]) => kind === "txn-save" || kind === "sub-save" || kind === "budget-save" || kind === "rule-save";

/**
 * Whether a new op makes an older queued one redundant: a txn (or
 * subscription) save or delete drops saves of the same row that were never
 * sent and aren't in flight (a save carries the whole row, and a delete makes
 * any unsent save moot). A
 * tried save stays: it may already be on the server, so it goes first and the
 * newer op lands on top of it. Account ops never drop anything: they are
 * rare, and a txn queued after one may need it on the server.
 */
export function supersedes(next: MoneyOp, old: MoneyOp, inFlight: string | null): boolean {
  if (!isRowWrite(next.kind)) return false;
  return isRowSave(old.kind) && old.key === next.key && !old.tried && old.opId !== inFlight;
}

/** The device side of the queue. Every step is atomic across tabs. */
export interface MoneyQueueStore {
  /** Appends an op, dropping the older ones it supersedes. */
  add(op: MoneyOp): Promise<void>;
  /** The oldest op, marked in flight so `add` leaves it alone. */
  take(): Promise<MoneyOp | null>;
  /** The op was answered: removes it. Returns whether more ops for its key are waiting. */
  finish(op: MoneyOp): Promise<boolean>;
  /** The send failed: the op stays at the head, marked tried. */
  release(op: MoneyOp): Promise<void>;
  pending(): Promise<MoneyOp[]>;
  count(): Promise<number>;
}

/** The store for tests, and where IndexedDB is unavailable: the same rules, kept in memory. */
export class MemoryMoneyStore implements MoneyQueueStore {
  #ops: MoneyOp[] = [];
  #seq = 0;
  #inFlight: string | null = null;

  add(op: MoneyOp): Promise<void> {
    this.#ops = this.#ops.filter((o) => !supersedes(op, o, this.#inFlight));
    this.#ops.push({ ...op, seq: ++this.#seq });
    return Promise.resolve();
  }

  take(): Promise<MoneyOp | null> {
    const head = this.#ops[0] ?? null;
    this.#inFlight = head?.opId ?? null;
    return Promise.resolve(head);
  }

  finish(op: MoneyOp): Promise<boolean> {
    this.#ops = this.#ops.filter((o) => o.opId !== op.opId);
    if (this.#inFlight === op.opId) this.#inFlight = null;
    return Promise.resolve(this.#ops.some((o) => o.key === op.key));
  }

  release(op: MoneyOp): Promise<void> {
    this.#ops = this.#ops.map((o) => (o.opId === op.opId ? { ...o, tried: true } : o));
    if (this.#inFlight === op.opId) this.#inFlight = null;
    return Promise.resolve();
  }

  pending(): Promise<MoneyOp[]> {
    return Promise.resolve([...this.#ops]);
  }

  count(): Promise<number> {
    return Promise.resolve(this.#ops.length);
  }
}

export interface MoneyOutboxOptions {
  store: MoneyQueueStore | Promise<MoneyQueueStore>;
  /** Sends one op to the server (the matching server action). */
  send: (op: MoneyOp) => Promise<MoneyResult>;
  onEvent: (event: MoneyEvent) => void;
  /** The queue grew or shrank. */
  onChange?: () => void;
  online?: () => boolean;
  /** Runs one drain at a time across tabs (a Web Lock in the browser). */
  lock?: <T>(run: () => Promise<T>) => Promise<T>;
  retryMs?: number;
  /** A send with no answer by then counts as failed (and is resent). 0: no limit. */
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  now?: () => number;
  newId?: () => string;
}

const FAILED = { ok: false, reason: "failed" } as const;

/** Failed, or "demo" from a server that no longer sees the owner's session: keep it for later. */
export function transient(result: MoneyResult): boolean {
  return !result.ok && (result.reason === "failed" || result.reason === "demo");
}

export class MoneyOutbox {
  readonly #opts: Required<MoneyOutboxOptions>;
  #running: Promise<void> | null = null;
  #again = false;
  #retryArmed = false;

  constructor(opts: MoneyOutboxOptions) {
    this.#opts = {
      onChange: () => undefined,
      online: () => true,
      lock: (run) => run(),
      retryMs: 5_000,
      timeoutMs: 20_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      ...opts,
    };
  }

  /** Queues a write, then sends what is queued. False if the device could not store it. */
  async enqueue(write: MoneyWrite): Promise<boolean> {
    const op = { ...write, key: keyOf(write), opId: this.#opts.newId(), queuedAt: this.#opts.now(), tried: false } as MoneyOp;
    try {
      await (await this.#opts.store).add(op);
    } catch (error) {
      console.error("money outbox: could not store a write", error);
      return false;
    }
    this.#opts.onChange();
    void this.flush();
    return true;
  }

  async pending(): Promise<MoneyOp[]> {
    return (await this.#opts.store).pending();
  }

  async count(): Promise<number> {
    return (await this.#opts.store).count();
  }

  /** Whether any op for this key is still queued. */
  async has(key: string): Promise<boolean> {
    return (await this.pending()).some((o) => o.key === key);
  }

  /** Sends everything queued, oldest first. Stops at a failure and tries again later. */
  flush(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#again = false;
    const run = async () => {
      do await this.#opts.lock(() => this.#drain());
      while (this.#takeAgain());
    };
    this.#running = run()
      .catch((error: unknown) => {
        console.error("money outbox: flush failed", error);
      })
      .finally(() => {
        this.#running = null;
      });
    return this.#running;
  }

  #takeAgain(): boolean {
    const again = this.#again;
    this.#again = false;
    return again;
  }

  async #drain(): Promise<void> {
    const store = await this.#opts.store;
    for (;;) {
      if (!this.#opts.online()) return;
      const op = await store.take();
      if (!op) return;
      const result = await this.#call(op);
      if (transient(result)) {
        await store.release(op);
        this.#armRetry();
        return;
      }
      const more = await store.finish(op);
      this.#opts.onEvent({ op, result, more } as MoneyEvent);
      this.#opts.onChange();
    }
  }

  #armRetry() {
    if (!this.#opts.online() || this.#retryArmed) return;
    this.#retryArmed = true;
    this.#opts.setTimer(() => {
      this.#retryArmed = false;
      void this.flush();
    }, this.#opts.retryMs);
  }

  async #call(op: MoneyOp): Promise<MoneyResult> {
    const ms = this.#opts.timeoutMs;
    try {
      if (!ms) return await this.#opts.send(op);
      return await new Promise<MoneyResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(FAILED);
        }, ms);
        this.#opts.send(op).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    } catch {
      return FAILED;
    }
  }
}
