import { describe, expect, it } from "vitest";
import { draftNote, writeOf, type Note, type NoteWrite } from "./notes";
import { MemoryNotesStore, Outbox, type DeleteResult, type OutboxEvent } from "./outbox";
import type { NoteStatus, SendResult } from "./sync";

const NOW = 1_800_000_000_000;
const ID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";
const OTHER = "5d0c7f0e-2b7a-4f8e-9d55-0c1e2f3a4b5c";

function note(over: Partial<Note> = {}): Note {
  return { ...draftNote(ID, NOW), version: 1, ...over };
}

type Call =
  | { kind: "save"; write: NoteWrite; resolve: (r: SendResult) => void; reject: () => void }
  | { kind: "delete"; id: string; resolve: (r: DeleteResult) => void; reject: () => void };

/** An outbox whose sends the test answers by hand. */
function harness(opts: { sync?: boolean } = {}) {
  const calls: Call[] = [];
  const events: OutboxEvent[] = [];
  const statuses: [string, NoteStatus][] = [];
  const timers: (() => void)[] = [];
  const net = { online: true };
  const store = new MemoryNotesStore();
  let n = 0;
  const outbox = new Outbox({
    store,
    sync: opts.sync ?? true,
    sendSave: (write) =>
      new Promise<SendResult>((resolve, reject) => {
        calls.push({ kind: "save", write, resolve, reject: () => { reject(new Error("offline")); } });
      }),
    sendDelete: (id) =>
      new Promise<DeleteResult>((resolve, reject) => {
        calls.push({ kind: "delete", id, resolve, reject: () => { reject(new Error("offline")); } });
      }),
    onEvent: (e) => events.push(e),
    onStatus: (id, s) => statuses.push([id, s]),
    online: () => net.online,
    setTimer: (fn) => timers.push(fn),
    timeoutMs: 0,
    newId: () => `op-${String(++n)}`,
    now: () => NOW,
  });
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const save = (i: number) => {
    const c = calls[i];
    if (c?.kind !== "save") throw new Error(`call ${String(i)} is not a save`);
    return c;
  };
  const last = (id = ID) => statuses.filter(([s]) => s === id).at(-1)?.[1];
  return { outbox, store, calls, events, statuses, timers, net, settle, save, last };
}

const saved = (n: Note): SendResult => ({ ok: true, kind: "saved", note: n });

describe("Outbox", () => {
  it("keeps one write in flight and sends only the newest waiting one, on the version the first produced", async () => {
    const h = harness();
    const base = note({ version: 1 });
    await h.outbox.enqueue({ ...writeOf(base), title: "a" });
    await h.outbox.enqueue({ ...writeOf(base), title: "ab" });
    await h.outbox.enqueue({ ...writeOf(base), title: "abc" });
    await h.settle();
    expect(h.calls).toHaveLength(1);
    expect(await h.outbox.count()).toBe(2);

    h.save(0).resolve(saved(note({ title: "a", version: 2 })));
    await h.settle();
    expect(h.calls).toHaveLength(2);
    expect(h.save(1).write).toMatchObject({ title: "abc", baseVersion: 2 });

    h.save(1).resolve(saved(note({ title: "abc", version: 3 })));
    await h.settle();
    expect(h.last()).toBe("saved");
    expect(await h.outbox.count()).toBe(0);
  });

  it("after losing a conflict, sends the waiting write on its own old version (so it conflicts by V23, not overwrites)", async () => {
    const h = harness();
    const base = note({ version: 1 });
    await h.outbox.enqueue({ ...writeOf(base), title: "mine" });
    await h.outbox.enqueue({ ...writeOf(base), title: "mine, more" });
    await h.settle();
    h.save(0).resolve({ ok: true, kind: "conflict", won: false, note: note({ title: "theirs", version: 5 }) });
    await h.settle();
    expect(h.save(1).write.baseVersion).toBe(1);
  });

  it("builds on a conflict it won", async () => {
    const h = harness();
    const base = note({ version: 1 });
    await h.outbox.enqueue({ ...writeOf(base), title: "mine" });
    await h.outbox.enqueue({ ...writeOf(base), title: "mine, more" });
    await h.settle();
    h.save(0).resolve({ ok: true, kind: "conflict", won: true, note: note({ title: "mine", version: 6 }) });
    await h.settle();
    expect(h.save(1).write.baseVersion).toBe(6);
  });

  it("resends a write that got no answer before the newer one, so a lost reply can't become a conflict with itself", async () => {
    const h = harness();
    const base = note({ version: 1 });
    await h.outbox.enqueue({ ...writeOf(base), title: "W1" });
    await h.settle();
    h.save(0).reject(); // W1 landed as v2, but the reply was lost
    await h.settle();
    expect(h.last()).toBe("retrying");

    await h.outbox.enqueue({ ...writeOf(base), title: "W2" });
    await h.outbox.enqueue({ ...writeOf(base), title: "W3" });
    expect((await h.outbox.pending()).map((o) => (o.kind === "save" ? o.write.title : o.kind))).toEqual(["W1", "W3"]);

    h.timers[0]?.();
    await h.settle();
    expect(h.save(h.calls.length - 1).write.title).toBe("W1");
    h.save(h.calls.length - 1).resolve({ ok: true, kind: "unchanged", note: note({ title: "W1", version: 2 }) });
    await h.settle();
    expect(h.save(h.calls.length - 1).write).toMatchObject({ title: "W3", baseVersion: 2 });
  });

  it("waits while offline and sends in order once back", async () => {
    const h = harness();
    h.net.online = false;
    await h.outbox.enqueue({ ...writeOf(note()), title: "one" });
    await h.outbox.enqueue({ ...writeOf(note({ id: OTHER })), title: "two" });
    await h.settle();
    expect(h.calls).toHaveLength(0);
    expect(h.last()).toBe("queued");
    expect(await h.outbox.count()).toBe(2);

    h.net.online = true;
    void h.outbox.flush();
    await h.settle();
    expect(h.save(0).write.title).toBe("one");
    h.save(0).resolve(saved(note({ title: "one", version: 2 })));
    await h.settle();
    expect(h.save(1).write.title).toBe("two");
  });

  it("sends a delete after the note's earlier writes, so a pending edit can't bring the note back", async () => {
    const h = harness();
    const archived = note({ archived: true, version: 3 });
    await h.outbox.enqueue({ ...writeOf(archived), title: "late edit" });
    await h.settle();
    h.save(0).reject();
    await h.settle();
    await h.outbox.remove(ID);

    h.timers[0]?.();
    await h.settle();
    expect(h.calls.map((c) => c.kind)).toEqual(["save", "save"]);
    h.save(1).resolve(saved(note({ archived: true, title: "late edit", version: 4 })));
    await h.settle();
    expect(h.calls[2]?.kind).toBe("delete");
    const del = h.calls[2];
    if (del?.kind === "delete") del.resolve({ ok: true });
    await h.settle();
    expect(await h.outbox.count()).toBe(0);
    expect(h.events.map((e) => e.kind)).toEqual(["save", "delete"]);
  });

  it("keeps a restore's flag when a later save replaces it in the queue", async () => {
    const h = harness();
    h.net.online = false;
    await h.outbox.enqueue({ ...writeOf(note()), title: "restored", keepCurrent: true });
    await h.outbox.enqueue({ ...writeOf(note()), title: "restored, then typed" });
    const [op] = await h.outbox.pending();
    expect(op?.kind === "save" && op.write).toMatchObject({ title: "restored, then typed", keepCurrent: true });
  });

  it("drops an invalid write with an error, and keeps a write the server answered as demo (a lost session)", async () => {
    const h = harness();
    await h.outbox.enqueue({ ...writeOf(note()), title: "x" });
    await h.settle();
    h.save(0).resolve({ ok: false, reason: "invalid" });
    await h.settle();
    expect(h.last()).toBe("error");
    expect(await h.outbox.count()).toBe(0);

    await h.outbox.enqueue({ ...writeOf(note()), title: "y" });
    await h.settle();
    h.save(1).resolve({ ok: false, reason: "demo" });
    await h.settle();
    expect(await h.outbox.count()).toBe(1);
  });

  it("in demo, keeps writes on the device and never sends them", async () => {
    const h = harness({ sync: false });
    await h.outbox.enqueue({ ...writeOf(note()), title: "x" });
    await h.outbox.flush();
    await h.settle();
    expect(h.calls).toHaveLength(0);
    expect(h.last()).toBe("local");
  });
});
