import type { DoneResult, SaveTxnResult } from "@/actions/money";
import { removeTxn, upsertTxn, writeOf, type MoneyPayload, type Txn, type TxnWrite } from "@/lib/money/money";

// One writer per device for money txns (SPEC V28). Every id has at most one
// live write: a newer save or a delete takes the id over, and the older write
// stops at its next step without touching the cache. A delete waits for the
// server call already in flight for that id before it is sent, so a save
// retrying in the background can never bring a deleted txn back (PR review
// FIX), and an older retry can never overwrite a newer save.

export interface WriterDeps {
  saveTxn: (w: TxnWrite) => Promise<SaveTxnResult>;
  deleteTxn: (input: { id: string }) => Promise<DoneResult>;
  setPending: (id: string, txn: Txn | null) => void;
  clearPending: (id: string) => void;
  wait: (ms: number) => Promise<void>;
  retryMs: readonly number[];
}

export type WriteCache = (fn: (p: MoneyPayload) => MoneyPayload) => void;

export type SaveOutcome = { ok: true } | { ok: false; reason: Exclude<SaveTxnResult, { ok: true }>["reason"] | "superseded" };
export type RemoveOutcome = { ok: true } | { ok: false; reason: "failed" | "superseded" };

interface Slot {
  /** The server call this slot has in flight, if any. */
  call: Promise<unknown> | null;
  /** Settles once every older write's server call has: the wait is carried forward, so a third write never skips the first's call. */
  prior: Promise<unknown>;
}

export function createTxnWriter(deps: WriterDeps) {
  const slots = new Map<string, Slot>();

  /** Takes the id over, then waits for every older write's server call still running. */
  async function claim(id: string): Promise<Slot> {
    const prev = slots.get(id);
    // Set before any await, so the next claimer chains onto this one.
    const slot: Slot = { call: null, prior: Promise.all([prev?.prior, prev?.call]).catch(() => undefined) };
    slots.set(id, slot);
    await slot.prior;
    return slot;
  }

  const current = (id: string, slot: Slot) => slots.get(id) === slot;

  function release(id: string, slot: Slot) {
    if (!current(id, slot)) return;
    slots.delete(id);
    deps.clearPending(id);
  }

  async function call<T>(slot: Slot, run: () => Promise<T>, fallback: T): Promise<T> {
    const p = run().catch(() => fallback);
    slot.call = p;
    try {
      return await p;
    } finally {
      slot.call = null;
    }
  }

  async function save(txn: Txn, writeCache: WriteCache): Promise<SaveOutcome> {
    deps.setPending(txn.id, txn);
    const slot = await claim(txn.id);
    for (let attempt = 0; ; attempt++) {
      if (!current(txn.id, slot)) return { ok: false, reason: "superseded" };
      const result = await call<SaveTxnResult>(slot, () => deps.saveTxn(writeOf(txn)), { ok: false, reason: "failed" });
      if (!current(txn.id, slot)) return { ok: false, reason: "superseded" };
      if (result.ok) {
        const saved = result.txn;
        writeCache((p) => upsertTxn(p, saved));
        release(txn.id, slot);
        return { ok: true };
      }
      const delay = deps.retryMs[attempt];
      if (result.reason !== "failed" || delay === undefined) {
        release(txn.id, slot);
        return { ok: false, reason: result.reason };
      }
      await deps.wait(delay);
    }
  }

  async function remove(txn: Txn, writeCache: WriteCache): Promise<RemoveOutcome> {
    deps.setPending(txn.id, null);
    const slot = await claim(txn.id);
    if (!current(txn.id, slot)) return { ok: false, reason: "superseded" };
    const result = await call<DoneResult>(slot, () => deps.deleteTxn({ id: txn.id }), { ok: false, reason: "failed" });
    if (!current(txn.id, slot)) return { ok: false, reason: "superseded" };
    if (result.ok) writeCache((p) => removeTxn(p, txn.id));
    release(txn.id, slot);
    return result.ok ? { ok: true } : { ok: false, reason: "failed" };
  }

  return { save, remove, busy: (id: string) => slots.has(id) };
}

