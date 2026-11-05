import { describe, expect, it } from "vitest";
import type { Account, Txn } from "./money";
import type { Subscription } from "./subscriptions";
import { MemoryMoneyStore, MoneyOutbox, supersedes, type MoneyOp, type MoneyResult } from "./outbox";

const T = { id: "t1" } as Txn;
const A = { id: "a1" } as Account;
const S = { id: "s1" } as Subscription;

function op(over: Partial<MoneyOp> & Pick<MoneyOp, "kind">): MoneyOp {
  const base = { opId: "x", queuedAt: 0, tried: false };
  if (over.kind === "txn-save" || over.kind === "txn-delete") return { key: "txn:t1", txn: T, ...base, ...over };
  if (over.kind === "sub-save" || over.kind === "sub-delete") return { key: "sub:s1", subscription: S, ...base, ...over };
  return { key: "account:a1", account: A, ...base, ...over };
}

describe("supersedes", () => {
  it("a txn save or delete drops an unsent save of the same txn only", () => {
    const old = op({ kind: "txn-save", opId: "old" });
    expect(supersedes(op({ kind: "txn-save" }), old, null)).toBe(true);
    expect(supersedes(op({ kind: "txn-delete" }), old, null)).toBe(true);
    expect(supersedes(op({ kind: "txn-save" }), { ...old, tried: true }, null)).toBe(false);
    expect(supersedes(op({ kind: "txn-save" }), old, "old")).toBe(false);
    expect(supersedes(op({ kind: "txn-save", key: "txn:t2" }), old, null)).toBe(false);
    expect(supersedes(op({ kind: "txn-save" }), op({ kind: "txn-delete", opId: "d" }), null)).toBe(false);
  });

  it("a subscription save or delete drops an unsent save of the same subscription only", () => {
    const old = op({ kind: "sub-save", opId: "old" });
    expect(supersedes(op({ kind: "sub-save" }), old, null)).toBe(true);
    expect(supersedes(op({ kind: "sub-delete" }), old, null)).toBe(true);
    expect(supersedes(op({ kind: "sub-save" }), { ...old, tried: true }, null)).toBe(false);
    expect(supersedes(op({ kind: "sub-save" }), old, "old")).toBe(false);
    expect(supersedes(op({ kind: "sub-save", key: "sub:s2" }), old, null)).toBe(false);
    expect(supersedes(op({ kind: "sub-save" }), op({ kind: "sub-delete", opId: "d" }), null)).toBe(false);
    // Different kinds never share a key, so a txn op never drops a subscription save.
    expect(supersedes(op({ kind: "txn-save" }), old, null)).toBe(false);
  });

  it("account ops never drop anything and are never dropped", () => {
    expect(supersedes(op({ kind: "account-save" }), op({ kind: "account-save", opId: "old" }), null)).toBe(false);
    expect(supersedes(op({ kind: "account-archive" }), op({ kind: "account-save", opId: "old" }), null)).toBe(false);
    expect(supersedes(op({ kind: "txn-save" }), op({ kind: "account-save", key: "txn:t1" }), null)).toBe(false);
  });
});

describe("MoneyOutbox", () => {
  it("counts a send with no answer by the deadline as failed, and keeps the op marked tried", async () => {
    const store = new MemoryMoneyStore();
    const timers: (() => void)[] = [];
    const outbox = new MoneyOutbox({
      store,
      send: () => new Promise<MoneyResult>(() => undefined),
      onEvent: () => undefined,
      timeoutMs: 5,
      setTimer: (fn) => timers.push(fn),
    });
    await outbox.enqueue({ kind: "txn-save", txn: T });
    await outbox.flush();
    const [left] = await store.pending();
    expect(left).toMatchObject({ kind: "txn-save", tried: true });
    expect(timers).toHaveLength(1);
  });

  it("sends nothing while offline, and everything in order once back", async () => {
    const sent: string[] = [];
    const net = { online: false };
    const outbox = new MoneyOutbox({
      store: new MemoryMoneyStore(),
      send: (o) => {
        sent.push(o.kind);
        if (o.kind === "sub-save") return Promise.resolve({ ok: true, subscription: S, notices: [] });
        return Promise.resolve(o.kind === "txn-save" ? { ok: true, txn: T } : o.kind === "txn-delete" || o.kind === "sub-delete" ? { ok: true } : { ok: true, account: A });
      },
      onEvent: () => undefined,
      online: () => net.online,
    });
    await outbox.enqueue({ kind: "account-save", account: A });
    await outbox.enqueue({ kind: "txn-save", txn: T });
    await outbox.enqueue({ kind: "sub-save", subscription: S });
    await outbox.flush();
    expect(sent).toEqual([]);
    net.online = true;
    await outbox.flush();
    expect(sent).toEqual(["account-save", "txn-save", "sub-save"]);
    expect(await outbox.count()).toBe(0);
  });
});
