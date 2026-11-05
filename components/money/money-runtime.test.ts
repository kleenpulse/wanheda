import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/toaster";
import { applyPending, applyPendingSubscriptions, MONEY_KEY, type Account, type MoneyPayload, type Txn } from "@/lib/money/money";
import { blankSubscription, type Subscription } from "@/lib/money/subscriptions";
import { pushNotices } from "@/lib/notifications/inbox";
import { MemoryMoneyStore, type MoneyOp, type MoneyOutboxOptions, type MoneyResult } from "@/lib/money/outbox";
import { seedMoney } from "@/lib/money/seed";
import { createMoneyRuntime, useMoneyLocal } from "./money-runtime";

vi.mock("@/actions/money", () => ({}));
vi.mock("@/components/ui/toaster", () => ({ toast: vi.fn() }));
vi.mock("@/lib/notifications/inbox", () => ({ pushNotices: vi.fn() }));

// The B13 race tests, ported from the in-memory writer to the outbox (SPEC
// V28), plus what a queue that outlives the tab adds: replay after a reload,
// two tabs on one queue, and the undo toast around queued writes.

const T: Txn = {
  id: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10",
  accountId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11",
  postedOn: "2026-11-05",
  amountMinor: -450_000,
  currency: "NGN",
  payee: "jollof",
  categoryId: null,
  note: "",
  tags: [],
  source: "manual",
  transferId: null,
  createdAt: 1,
};

const ACCOUNT: Account = {
  id: "5d0c7f0e-2b7a-4f8e-9d55-0c1e2f3a4b5c",
  slug: null,
  name: "Savings",
  kind: "bank",
  currency: "NGN",
  openingMinor: 0,
  archived: false,
};

interface Call {
  op: MoneyOp;
  resolve: (r: MoneyResult) => void;
  reject: () => void;
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

/** One tab: a runtime whose server calls the test answers by hand. */
function tab(opts: { store?: MemoryMoneyStore; lock?: MoneyOutboxOptions["lock"]; name?: string; rows?: Txn[] } = {}) {
  const qc = new QueryClient();
  qc.setQueryData<MoneyPayload>(MONEY_KEY, { ...seedMoney("2026-11-05"), txns: opts.rows ?? [] });
  const calls: Call[] = [];
  const timers: (() => void)[] = [];
  const net = { online: true };
  let n = 0;
  const store = opts.store ?? new MemoryMoneyStore();
  const rt = createMoneyRuntime(qc, false, {
    store,
    send: (op) =>
      new Promise<MoneyResult>((resolve, reject) => {
        calls.push({ op, resolve, reject: () => { reject(new Error("offline")); } });
      }),
    online: () => net.online,
    setTimer: (fn) => timers.push(fn),
    timeoutMs: 0,
    newId: () => `${opts.name ?? "a"}-${String(++n)}`,
    // Node has navigator.locks too: one real lock would chain every test together.
    lock: opts.lock ?? ((run) => run()),
  });
  const cached = () => qc.getQueryData<MoneyPayload>(MONEY_KEY)?.txns ?? [];
  /** What the owner sees: the cache with the overlay on top. */
  const rows = () => {
    const p = qc.getQueryData<MoneyPayload>(MONEY_KEY);
    return p ? applyPending(p, useMoneyLocal.getState().txns).txns : [];
  };
  const retry = async () => {
    for (const t of timers.splice(0)) t();
    await settle();
  };
  const kinds = () => calls.map((c) => c.op.kind);
  return { qc, rt, calls, net, store, cached, rows, retry, kinds };
}

const saved = (t: Txn): MoneyResult => ({ ok: true, txn: t });

beforeEach(() => {
  useMoneyLocal.setState({ txns: {}, accounts: {}, subs: {}, queued: 0 });
  vi.mocked(toast).mockClear();
  vi.mocked(pushNotices).mockClear();
});

describe("money outbox: txn writes", () => {
  it("shows a save at once, then writes the server's copy to the cache and drops the overlay", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    expect(h.rows().map((t) => t.id)).toEqual([T.id]);
    await settle();
    expect(h.calls).toHaveLength(1);
    h.calls[0]?.resolve(saved({ ...T, payee: "server" }));
    await settle();
    expect(h.cached().map((t) => t.payee)).toEqual(["server"]);
    expect(useMoneyLocal.getState().txns).toEqual({});
    expect(await h.rt.outbox.count()).toBe(0);
  });

  it("does not retry a refusal: the row goes and the owner is told", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    h.calls[0]?.resolve({ ok: false, reason: "archived-account" });
    await settle();
    await h.retry();
    expect(h.calls).toHaveLength(1);
    expect(h.rows()).toEqual([]);
    expect(toast).toHaveBeenCalledOnce();
    expect(await h.rt.outbox.count()).toBe(0);
  });

  it("keeps a failed save and sends it again, however many tries it takes (no more dropped entries)", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    for (let i = 0; i < 5; i++) {
      h.calls.at(-1)?.reject();
      await settle();
      expect(h.rows().map((t) => t.id)).toEqual([T.id]);
      await h.retry();
    }
    expect(h.calls).toHaveLength(6);
    h.calls.at(-1)?.resolve(saved(T));
    await settle();
    expect(h.cached().map((t) => t.id)).toEqual([T.id]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("a session that reads as demo mid-flight keeps the write for later", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    h.calls[0]?.resolve({ ok: false, reason: "demo" });
    await settle();
    expect(await h.rt.outbox.count()).toBe(1);
    expect(h.rows().map((t) => t.id)).toEqual([T.id]);
  });

  it("B13: a delete after a failed save goes behind the save's resend, so the txn never comes back", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    h.calls[0]?.reject();
    await settle();
    h.rt.hideTxn(T.id);
    h.rt.deleteTxn(T);
    await settle();
    // The tried save may have landed, so it is resent first and stays queued.
    expect(h.kinds()).toEqual(["txn-save", "txn-save"]);
    h.calls[1]?.resolve(saved(T));
    await settle();
    expect(h.rows()).toEqual([]); // still hidden: the delete is queued behind it
    expect(h.kinds()).toEqual(["txn-save", "txn-save", "txn-delete"]);
    h.calls[2]?.resolve({ ok: true });
    await settle();
    expect(h.cached()).toEqual([]);
    expect(useMoneyLocal.getState().txns).toEqual({});
  });

  it("a delete of a save never sent drops the save: only the delete goes", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveTxn(T);
    h.rt.hideTxn(T.id);
    h.rt.deleteTxn(T);
    await settle();
    h.net.online = true;
    void h.rt.outbox.flush();
    await settle();
    expect(h.kinds()).toEqual(["txn-delete"]);
    h.calls[0]?.resolve({ ok: true });
    await settle();
    expect(h.rows()).toEqual([]);
    expect(useMoneyLocal.getState().txns).toEqual({});
  });

  it("B13: a delete waits for the save call already in flight, then deletes", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    h.rt.hideTxn(T.id);
    h.rt.deleteTxn(T);
    await settle();
    expect(h.kinds()).toEqual(["txn-save"]);
    h.calls[0]?.resolve(saved(T));
    await settle();
    expect(h.kinds()).toEqual(["txn-save", "txn-delete"]);
    h.calls[1]?.resolve({ ok: true });
    await settle();
    expect(h.cached()).toEqual([]);
    expect(h.rows()).toEqual([]);
  });

  it("a newer save replaces an older one that was never sent", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveTxn(T);
    h.rt.saveTxn({ ...T, amountMinor: -500_000 });
    await settle();
    h.net.online = true;
    void h.rt.outbox.flush();
    await settle();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]?.op).toMatchObject({ kind: "txn-save", txn: { amountMinor: -500_000 } });
  });

  it("an older save that was tried goes first, then the newer one lands over it", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    h.calls[0]?.reject();
    await settle();
    h.rt.saveTxn({ ...T, amountMinor: -500_000 });
    await h.retry();
    h.calls[1]?.resolve(saved(T));
    await settle();
    // The newer write is still queued: the row keeps showing it.
    expect(h.rows().map((t) => t.amountMinor)).toEqual([-500_000]);
    h.calls[2]?.resolve(saved({ ...T, amountMinor: -500_000 }));
    await settle();
    expect(h.calls.map((c) => (c.op.kind === "txn-save" ? c.op.txn.amountMinor : null))).toEqual([-450_000, -450_000, -500_000]);
    expect(h.cached().map((t) => t.amountMinor)).toEqual([-500_000]);
    expect(useMoneyLocal.getState().txns).toEqual({});
  });

  it("B13: a third write waits for the first's call while the second is still queued", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    h.rt.saveTxn({ ...T, amountMinor: -1 });
    h.rt.hideTxn(T.id);
    h.rt.deleteTxn(T);
    await settle();
    expect(h.kinds()).toEqual(["txn-save"]);
    h.calls[0]?.resolve(saved(T));
    await settle();
    expect(h.kinds()).toEqual(["txn-save", "txn-delete"]);
    h.calls[1]?.resolve({ ok: true });
    await settle();
    expect(h.cached()).toEqual([]);
    expect(useMoneyLocal.getState().txns).toEqual({});
  });

  it("a refused delete puts the row back", async () => {
    const h = tab({ rows: [T] });
    h.rt.hideTxn(T.id);
    h.rt.deleteTxn(T);
    await settle();
    expect(h.rows()).toEqual([]);
    h.calls[0]?.resolve({ ok: false, reason: "invalid" });
    await settle();
    expect(h.rows()).toEqual([T]);
    expect(toast).toHaveBeenCalledOnce();
  });
});

describe("money outbox: the undo toast", () => {
  it("an undo inside the toast window never reaches the server", async () => {
    const h = tab({ rows: [T] });
    const before = h.rt.hideTxn(T.id);
    expect(h.rows()).toEqual([]);
    h.rt.unhideTxn(T.id, before);
    await settle();
    expect(h.rows()).toEqual([T]);
    expect(h.calls).toEqual([]);
    expect(await h.rt.outbox.count()).toBe(0);
  });

  it("undo of a quick-add still queued offline shows it again (it isn't in the cache yet)", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveTxn(T);
    await settle();
    const before = h.rt.hideTxn(T.id);
    h.rt.unhideTxn(T.id, before);
    await settle();
    expect(h.rows().map((t) => t.id)).toEqual([T.id]);
  });

  it("a save that lands while its row is hidden leaves it hidden; undo then shows the server copy", async () => {
    const h = tab();
    h.rt.saveTxn(T);
    await settle();
    const before = h.rt.hideTxn(T.id);
    h.calls[0]?.resolve(saved({ ...T, payee: "server" }));
    await settle();
    expect(h.rows()).toEqual([]);
    h.rt.unhideTxn(T.id, before);
    await settle();
    expect(h.rows().map((t) => t.payee)).toEqual(["server"]);
    expect(useMoneyLocal.getState().txns).toEqual({});
  });
});

describe("money outbox: reloads, accounts and tabs", () => {
  it("replays what was queued before a reload, and shows it meanwhile", async () => {
    const store = new MemoryMoneyStore();
    const first = tab({ store });
    first.net.online = false;
    first.rt.saveTxn(T);
    await settle();
    useMoneyLocal.setState({ txns: {}, accounts: {}, queued: 0 }); // the tab is gone

    const second = tab({ store, name: "b" });
    await second.rt.boot();
    expect(second.rows().map((t) => t.id)).toEqual([T.id]);
    expect(useMoneyLocal.getState().queued).toBe(1);
    await settle();
    expect(second.kinds()).toEqual(["txn-save"]);
    second.calls[0]?.resolve(saved(T));
    await settle();
    expect(second.cached().map((t) => t.id)).toEqual([T.id]);
    expect(await second.rt.outbox.count()).toBe(0);
  });

  it("a txn on a new account lands after the account, and account ops all go in order", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveAccount(ACCOUNT);
    h.rt.saveTxn({ ...T, accountId: ACCOUNT.id });
    h.rt.archiveAccount({ ...ACCOUNT, archived: true });
    h.rt.saveAccount({ ...ACCOUNT, name: "Savings 2", archived: true });
    await settle();
    expect(useMoneyLocal.getState().accounts[ACCOUNT.id]?.name).toBe("Savings 2");
    h.net.online = true;
    void h.rt.outbox.flush();
    for (let i = 0; i < 4; i++) {
      await settle();
      const c = h.calls[i];
      c?.resolve(c.op.kind === "txn-save" ? saved(c.op.txn) : c.op.kind === "txn-delete" ? { ok: true } : "account" in c.op ? { ok: true, account: c.op.account } : { ok: true });
    }
    await settle();
    expect(h.kinds()).toEqual(["account-save", "txn-save", "account-archive", "account-save"]);
    expect(h.qc.getQueryData<MoneyPayload>(MONEY_KEY)?.accounts.find((a) => a.id === ACCOUNT.id)).toMatchObject({ name: "Savings 2", archived: true });
    expect(useMoneyLocal.getState().accounts).toEqual({});
  });

  it("a refused account write is dropped, said, and the window refetched", async () => {
    const h = tab();
    const refetch = vi.spyOn(h.qc, "invalidateQueries");
    h.rt.saveAccount(ACCOUNT);
    await settle();
    h.calls[0]?.resolve({ ok: false, reason: "invalid" });
    await settle();
    expect(useMoneyLocal.getState().accounts).toEqual({});
    expect(toast).toHaveBeenCalledOnce();
    expect(refetch).toHaveBeenCalled();
  });

  it("two tabs on one queue send each op once, one at a time", async () => {
    const store = new MemoryMoneyStore();
    let chain: Promise<unknown> = Promise.resolve();
    const lock = <R,>(run: () => Promise<R>): Promise<R> => {
      const next = chain.then(run);
      chain = next.catch(() => undefined);
      return next;
    };
    const a = tab({ store, lock, name: "a" });
    const b = tab({ store, lock, name: "b" });
    a.rt.saveTxn(T);
    await settle();
    void b.rt.outbox.flush();
    await settle();
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(0);
    b.rt.saveTxn({ ...T, id: "1b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10" });
    await settle();
    expect(b.calls).toHaveLength(0); // waits for a's drain to finish
    a.calls[0]?.resolve(saved(T));
    await settle();
    // a's drain sends what b queued (same queue), so b never sends it twice.
    expect(a.calls).toHaveLength(2);
    a.calls[1]?.resolve({ ok: true, txn: { ...T, id: "1b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10" } });
    await settle();
    expect(b.calls).toHaveLength(0);
    expect(await store.count()).toBe(0);
  });
});

const SUB: Subscription = {
  ...blankSubscription("2026-11-05", "USD"),
  id: "7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Netflix",
  amountMinor: 1_549,
  createdAt: 1,
};

describe("money outbox: subscriptions", () => {
  /** What the owner sees: cached subscriptions with the overlay on top. */
  const subs = (h: ReturnType<typeof tab>) => {
    const p = h.qc.getQueryData<MoneyPayload>(MONEY_KEY);
    return p ? (applyPendingSubscriptions(p, useMoneyLocal.getState().subs).subscriptions ?? []) : [];
  };

  it("a subscription on a new account lands after the account, and its reminders reach the centre", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveAccount(ACCOUNT);
    h.rt.saveSubscription({ ...SUB, accountId: ACCOUNT.id });
    await settle();
    expect(subs(h).map((s) => s.name)).toEqual(expect.arrayContaining(["Netflix"]));
    h.net.online = true;
    void h.rt.outbox.flush();
    await settle();
    h.calls[0]?.resolve({ ok: true, account: ACCOUNT });
    await settle();
    const notice = { id: "n1", kind: "money", title: "Netflix renews", body: null, href: null, dedupeKey: "k", createdAt: 1, readAt: null } as const;
    h.calls[1]?.resolve({ ok: true, subscription: { ...SUB, accountId: ACCOUNT.id, name: "Netflix (server)" }, notices: [notice] });
    await settle();
    expect(h.kinds()).toEqual(["account-save", "sub-save"]);
    expect(h.qc.getQueryData<MoneyPayload>(MONEY_KEY)?.subscriptions?.find((s) => s.id === SUB.id)?.name).toBe("Netflix (server)");
    expect(useMoneyLocal.getState().subs).toEqual({});
    expect(pushNotices).toHaveBeenCalledWith([notice]);
  });

  it("a newer save replaces an unsent one; a delete after it drops both and only the delete goes", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveSubscription(SUB);
    h.rt.saveSubscription({ ...SUB, amountMinor: 1_999 });
    await settle();
    expect(await h.rt.outbox.count()).toBe(1);
    expect(subs(h).find((s) => s.id === SUB.id)?.amountMinor).toBe(1_999);
    h.rt.hideSubscription(SUB.id);
    h.rt.deleteSubscription(SUB);
    await settle();
    expect(await h.rt.outbox.count()).toBe(1);
    expect(subs(h).some((s) => s.id === SUB.id)).toBe(false);
    h.net.online = true;
    void h.rt.outbox.flush();
    await settle();
    h.calls[0]?.resolve({ ok: true });
    await settle();
    expect(h.kinds()).toEqual(["sub-delete"]);
    expect(useMoneyLocal.getState().subs).toEqual({});
  });

  it("undo inside the toast window never reaches the server, and a still-queued save shows again", async () => {
    const h = tab();
    h.net.online = false;
    h.rt.saveSubscription(SUB);
    await settle();
    const before = h.rt.hideSubscription(SUB.id);
    expect(subs(h).some((s) => s.id === SUB.id)).toBe(false);
    h.rt.unhideSubscription(SUB.id, before);
    await settle();
    expect(subs(h).map((s) => s.id)).toContain(SUB.id);
    h.net.online = true;
    void h.rt.outbox.flush();
    await settle();
    expect(h.kinds()).toEqual(["sub-save"]);
  });

  it("a refused save is dropped and said, in the sending tab", async () => {
    const h = tab();
    h.rt.saveSubscription(SUB);
    await settle();
    h.calls[0]?.resolve({ ok: false, reason: "invalid" });
    await settle();
    expect(subs(h).some((s) => s.id === SUB.id)).toBe(false);
    expect(toast).toHaveBeenCalledOnce();
    expect(await h.rt.outbox.count()).toBe(0);
  });
});
