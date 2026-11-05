import { describe, expect, it, vi } from "vitest";
import { draftNote, writeOf, type Note, type NoteWrite } from "./notes";
import { NoteSender, mergeNotes, type NoteStatus, type SendResult } from "./sync";

const NOW = 1_800_000_000_000;
const ID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";

function note(over: Partial<Note> = {}): Note {
  return { ...draftNote(ID, NOW), version: 1, ...over };
}

describe("mergeNotes", () => {
  it("puts local edits over server rows, drops local deletes, adds local-only notes, sorts", () => {
    const server = [note({ id: "a", title: "server a", editedAt: 1 }), note({ id: "b", editedAt: 2 }), note({ id: "c", editedAt: 3 })];
    const merged = mergeNotes(server, {
      a: note({ id: "a", title: "local a", editedAt: 5 }),
      b: null,
      d: note({ id: "d", editedAt: 4, version: 0 }),
    });
    expect(merged.map((n) => [n.id, n.title])).toEqual([
      ["a", "local a"],
      ["d", ""],
      ["c", ""],
    ]);
  });
});

/** A send whose answer the test gives by hand. */
function harness() {
  const calls: { write: NoteWrite; resolve: (r: SendResult) => void; reject: () => void }[] = [];
  const results: [NoteWrite, SendResult][] = [];
  const statuses: NoteStatus[] = [];
  const timers: (() => void)[] = [];
  const sender = new NoteSender({
    send: (write) =>
      new Promise<SendResult>((resolve, reject) => {
        calls.push({ write, resolve, reject: () => { reject(new Error("offline")); } });
      }),
    onResult: (w, r) => results.push([w, r]),
    onStatus: (_id, s) => statuses.push(s),
    setTimer: (fn) => timers.push(fn),
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { sender, calls, results, statuses, timers, settle };
}

const saved = (n: Note): SendResult => ({ ok: true, kind: "saved", note: n });

describe("NoteSender", () => {
  it("keeps one write in flight and sends only the newest waiting one, on the version the first produced", async () => {
    const h = harness();
    const base = note({ version: 1 });
    h.sender.enqueue({ ...writeOf(base), title: "a" });
    h.sender.enqueue({ ...writeOf(base), title: "ab" });
    h.sender.enqueue({ ...writeOf(base), title: "abc" });
    expect(h.calls).toHaveLength(1);

    h.calls[0]?.resolve(saved(note({ title: "a", version: 2 })));
    await h.settle();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]?.write).toMatchObject({ title: "abc", baseVersion: 2 });

    h.calls[1]?.resolve(saved(note({ title: "abc", version: 3 })));
    await h.settle();
    expect(h.statuses.at(-1)).toBe("saved");
    expect(h.sender.busy(ID)).toBe(false);
  });

  it("after losing a conflict, sends the waiting write on its own old version (so it conflicts by V23, not overwrites)", async () => {
    const h = harness();
    const base = note({ version: 1 });
    h.sender.enqueue({ ...writeOf(base), title: "mine" });
    h.sender.enqueue({ ...writeOf(base), title: "mine, more" });
    h.calls[0]?.resolve({ ok: true, kind: "conflict", won: false, note: note({ title: "theirs", version: 5 }) });
    await h.settle();
    expect(h.calls[1]?.write.baseVersion).toBe(1);
  });

  it("builds on a conflict it won", async () => {
    const h = harness();
    const base = note({ version: 1 });
    h.sender.enqueue({ ...writeOf(base), title: "mine" });
    h.sender.enqueue({ ...writeOf(base), title: "mine, more" });
    h.calls[0]?.resolve({ ok: true, kind: "conflict", won: true, note: note({ title: "mine", version: 6 }) });
    await h.settle();
    expect(h.calls[1]?.write.baseVersion).toBe(6);
  });

  it("retries a failed send later with the newest content", async () => {
    const h = harness();
    const base = note({ version: 1 });
    h.sender.enqueue({ ...writeOf(base), title: "a" });
    h.calls[0]?.reject();
    await h.settle();
    expect(h.statuses.at(-1)).toBe("retrying");
    h.sender.enqueue({ ...writeOf(base), title: "newer" });
    expect(h.calls).toHaveLength(1); // waits for the retry
    h.timers[0]?.();
    await h.settle();
    expect(h.calls[1]?.write.title).toBe("newer");
  });

  it("marks demo writes local and invalid ones as errors", async () => {
    const h = harness();
    h.sender.enqueue(writeOf(note()));
    h.calls[0]?.resolve({ ok: false, reason: "demo" });
    await h.settle();
    expect(h.statuses.at(-1)).toBe("local");
    h.sender.enqueue({ ...writeOf(note()), title: "x" });
    h.calls[1]?.resolve({ ok: false, reason: "invalid" });
    await h.settle();
    expect(h.statuses.at(-1)).toBe("error");
    expect(vi.isFakeTimers()).toBe(false);
  });
});
