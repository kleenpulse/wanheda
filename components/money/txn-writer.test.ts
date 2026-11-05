import { describe, expect, it, vi } from "vitest";
import type { MoneyPayload, Txn } from "@/lib/money/money";
import { seedMoney } from "@/lib/money/seed";
import { createTxnWriter, type WriterDeps } from "./txn-writer";

vi.mock("@/actions/money", () => ({}));

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

function deferred<V>() {
  let resolve!: (v: V) => void;
  const promise = new Promise<V>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  let cache: MoneyPayload = { ...seedMoney("2026-11-05"), txns: [] };
  const pending = new Map<string, Txn | null>();
  const waits: (() => void)[] = [];
  const deps = {
    saveTxn: vi.fn<WriterDeps["saveTxn"]>(),
    deleteTxn: vi.fn<WriterDeps["deleteTxn"]>(),
    setPending: (id: string, t: Txn | null) => pending.set(id, t),
    clearPending: (id: string) => pending.delete(id),
    wait: () =>
      new Promise<void>((r) => {
        waits.push(r);
      }),
    retryMs: [1, 1, 1],
  } satisfies WriterDeps;
  const writer = createTxnWriter(deps);
  const writeCache = (fn: (p: MoneyPayload) => MoneyPayload) => {
    cache = fn(cache);
  };
  const wake = async () => {
    for (const w of waits.splice(0)) w();
    await flush();
  };
  return { deps, writer, writeCache, pending, wake, cache: () => cache };
}

describe("txn writer", () => {
  it("saves, writes the server's copy to the cache and clears pending", async () => {
    const s = setup();
    s.deps.saveTxn.mockResolvedValue({ ok: true, txn: { ...T, payee: "server" } });
    expect(await s.writer.save(T, s.writeCache)).toEqual({ ok: true });
    expect(s.cache().txns.map((t) => t.payee)).toEqual(["server"]);
    expect(s.pending.size).toBe(0);
  });

  it("does not retry a refusal", async () => {
    const s = setup();
    s.deps.saveTxn.mockResolvedValue({ ok: false, reason: "invalid" });
    expect(await s.writer.save(T, s.writeCache)).toEqual({ ok: false, reason: "invalid" });
    expect(s.deps.saveTxn).toHaveBeenCalledTimes(1);
    expect(s.pending.size).toBe(0);
  });

  it("gives up after the retries and reports it", async () => {
    const s = setup();
    s.deps.saveTxn.mockRejectedValue(new Error("offline"));
    const done = s.writer.save(T, s.writeCache);
    for (let i = 0; i < 4; i++) await s.wake();
    expect(await done).toEqual({ ok: false, reason: "failed" });
    expect(s.deps.saveTxn).toHaveBeenCalledTimes(4);
    expect(s.cache().txns).toEqual([]);
    expect(s.pending.size).toBe(0);
  });

  it("a delete during a save's retry wait stops the retry: the txn never comes back (review FIX)", async () => {
    const s = setup();
    s.deps.saveTxn.mockRejectedValueOnce(new Error("blip")).mockResolvedValue({ ok: true, txn: T });
    s.deps.deleteTxn.mockResolvedValue({ ok: true });
    const saving = s.writer.save(T, s.writeCache);
    await flush();
    expect(s.deps.saveTxn).toHaveBeenCalledTimes(1);
    expect(await s.writer.remove(T, s.writeCache)).toEqual({ ok: true });
    await s.wake();
    expect(await saving).toEqual({ ok: false, reason: "superseded" });
    expect(s.deps.saveTxn).toHaveBeenCalledTimes(1);
    expect(s.deps.deleteTxn).toHaveBeenCalledTimes(1);
    expect(s.cache().txns).toEqual([]);
    expect(s.pending.size).toBe(0);
    expect(s.writer.busy(T.id)).toBe(false);
  });

  it("a delete waits for the save call already in flight, then deletes", async () => {
    const s = setup();
    const call = deferred<Awaited<ReturnType<WriterDeps["saveTxn"]>>>();
    s.deps.saveTxn.mockReturnValue(call.promise);
    s.deps.deleteTxn.mockResolvedValue({ ok: true });
    const saving = s.writer.save(T, s.writeCache);
    await flush();
    const removing = s.writer.remove(T, s.writeCache);
    await flush();
    expect(s.deps.deleteTxn).not.toHaveBeenCalled();
    call.resolve({ ok: true, txn: T });
    expect(await removing).toEqual({ ok: true });
    expect(await saving).toEqual({ ok: false, reason: "superseded" });
    expect(s.deps.deleteTxn).toHaveBeenCalledTimes(1);
    expect(s.cache().txns).toEqual([]);
    expect(s.pending.size).toBe(0);
  });

  it("a newer save takes over from an older one that is retrying", async () => {
    const s = setup();
    const newer = { ...T, amountMinor: -500_000 };
    s.deps.saveTxn.mockRejectedValueOnce(new Error("blip")).mockResolvedValue({ ok: true, txn: newer });
    const older = s.writer.save(T, s.writeCache);
    await flush();
    expect(await s.writer.save(newer, s.writeCache)).toEqual({ ok: true });
    await s.wake();
    expect(await older).toEqual({ ok: false, reason: "superseded" });
    expect(s.deps.saveTxn).toHaveBeenCalledTimes(2);
    expect(s.deps.saveTxn).toHaveBeenLastCalledWith(expect.objectContaining({ amountMinor: -500_000 }));
    expect(s.cache().txns.map((t) => t.amountMinor)).toEqual([-500_000]);
    expect(s.pending.size).toBe(0);
  });

  it("a third write waits for the first's call even while the second is still claiming", async () => {
    const s = setup();
    const callA = deferred<Awaited<ReturnType<WriterDeps["saveTxn"]>>>();
    s.deps.saveTxn.mockReturnValueOnce(callA.promise).mockResolvedValue({ ok: true, txn: T });
    s.deps.deleteTxn.mockResolvedValue({ ok: true });
    const a = s.writer.save(T, s.writeCache);
    await flush();
    const b = s.writer.save({ ...T, amountMinor: -1 }, s.writeCache);
    const c = s.writer.remove(T, s.writeCache);
    await flush();
    expect(s.deps.deleteTxn).not.toHaveBeenCalled();
    callA.resolve({ ok: true, txn: T });
    expect(await c).toEqual({ ok: true });
    expect(await a).toEqual({ ok: false, reason: "superseded" });
    expect(await b).toEqual({ ok: false, reason: "superseded" });
    expect(s.deps.saveTxn).toHaveBeenCalledTimes(1);
    expect(s.deps.deleteTxn).toHaveBeenCalledTimes(1);
    expect(s.cache().txns).toEqual([]);
    expect(s.pending.size).toBe(0);
  });

  it("a failed delete puts the row back", async () => {
    const s = setup();
    s.writeCache((p) => ({ ...p, txns: [T] }));
    s.deps.deleteTxn.mockResolvedValue({ ok: false, reason: "failed" });
    expect(await s.writer.remove(T, s.writeCache)).toEqual({ ok: false, reason: "failed" });
    expect(s.cache().txns).toEqual([T]);
    expect(s.pending.size).toBe(0);
  });
});
