import { describe, expect, it } from "vitest";
import { currentIndex, cycleRepeat, followingIndex, moveTo, precedingIndex, setShuffle, startQueue, upNext } from "./queue";

const items = ["a", "b", "c", "d", "e"];
/** A fixed "random" so shuffles are repeatable. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length] ?? 0;
};

describe("music queue (V59)", () => {
  it("starts at the picked track and plays the rest of the list in order", () => {
    const q = startQueue(items, 2, { shuffle: false, repeat: "off" });
    expect(currentIndex(q)).toBe(2);
    expect(followingIndex(q, 2, true)).toBe(3);
    expect(followingIndex(q, 4, true)).toBeNull();
    expect(upNext(q, 10).map((x) => x.item)).toEqual(["d", "e"]);
  });

  it("shuffles the rest with Fisher–Yates and keeps the current track first", () => {
    const q = startQueue(items, 2, { shuffle: true, repeat: "off" }, seq(0.1, 0.9, 0.5, 0.3));
    expect(q.order[0]).toBe(2);
    expect(currentIndex(q)).toBe(2);
    expect([...q.order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("turning shuffle on keeps the current track; off restores the list's order there", () => {
    let q = startQueue(items, 3, { shuffle: false, repeat: "off" });
    q = setShuffle(q, true, seq(0.7, 0.2, 0.4));
    expect(currentIndex(q)).toBe(3);
    expect(q.at).toBe(0);
    q = moveTo(q, q.order[2] ?? 0);
    const playing = currentIndex(q);
    q = setShuffle(q, false);
    expect(q.order).toEqual([0, 1, 2, 3, 4]);
    expect(currentIndex(q)).toBe(playing);
  });

  it("repeat all wraps, repeat one replays on its own but Next still moves on", () => {
    const all = startQueue(items, 4, { shuffle: false, repeat: "all" });
    expect(followingIndex(all, 4, true)).toBe(0);
    const one = { ...all, repeat: "one" as const };
    expect(followingIndex(one, 4, true)).toBe(4);
    expect(followingIndex(one, 1, false)).toBe(2);
  });

  it("previous goes back one, wraps with repeat, and stays on the first track otherwise", () => {
    const q = startQueue(items, 0, { shuffle: false, repeat: "off" });
    expect(precedingIndex(q, 3)).toBe(2);
    expect(precedingIndex(q, 0)).toBe(0);
    expect(precedingIndex({ ...q, repeat: "all" }, 0)).toBe(4);
  });

  it("cycles repeat off → all → one → off", () => {
    expect(cycleRepeat("off")).toBe("all");
    expect(cycleRepeat("all")).toBe("one");
    expect(cycleRepeat("one")).toBe("off");
  });

  it("an empty list has no current track", () => {
    const q = startQueue([], 0, { shuffle: true, repeat: "all" });
    expect(currentIndex(q)).toBeNull();
  });
});
