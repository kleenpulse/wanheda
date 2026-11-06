import { describe, expect, it } from "vitest";
import { MemoryReaderStore } from "./local";

const w = (documentId: string, at: number) => ({ documentId, locator: "pdf:1:0", percent: 1, at });

describe("progress queue (V41)", () => {
  it("keeps one position per document, the newest", async () => {
    const s = new MemoryReaderStore();
    await s.put(w("a", 2));
    await s.put(w("a", 1));
    await s.put(w("b", 1));
    expect(await s.pending()).toEqual([w("a", 2), w("b", 1)]);
  });

  it("an answer only clears the write it was for, not a newer one queued since", async () => {
    const s = new MemoryReaderStore();
    await s.put(w("a", 1));
    const sent = w("a", 1);
    await s.put(w("a", 2));
    await s.settle(sent);
    expect(await s.pending()).toEqual([w("a", 2)]);
    await s.settle(w("a", 2));
    expect(await s.pending()).toEqual([]);
  });
});
