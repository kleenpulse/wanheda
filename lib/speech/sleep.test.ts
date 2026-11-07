import { describe, expect, it } from "vitest";
import { chapterEnd, nextSleep, sleepLabel, startSleep } from "./sleep";

describe("sleep timer", () => {
  it("ends at the next chapter's first sentence, else the end", () => {
    expect(chapterEnd([10, 20], 0, 30)).toBe(10);
    expect(chapterEnd([10, 20], 10, 30)).toBe(20);
    expect(chapterEnd([10, 20], 25, 30)).toBe(30);
    expect(chapterEnd([], 3, 30)).toBe(30);
  });

  it("starts from the pick", () => {
    expect(startSleep({ kind: "minutes", minutes: 15 }, 1000, [], 0, 9)).toEqual({ kind: "minutes", minutes: 15, at: 1000 + 15 * 60_000 });
    expect(startSleep({ kind: "chapter" }, 1000, [4, 8], 5, 9)).toEqual({ kind: "chapter", end: 8 });
  });

  it("cycles off, minutes, chapter (when there are chapters), off", () => {
    expect(nextSleep(null, true)).toEqual({ kind: "minutes", minutes: 15 });
    expect(nextSleep({ kind: "minutes", minutes: 15, at: 0 }, true)).toEqual({ kind: "minutes", minutes: 30 });
    expect(nextSleep({ kind: "minutes", minutes: 60, at: 0 }, true)).toEqual({ kind: "chapter" });
    expect(nextSleep({ kind: "minutes", minutes: 60, at: 0 }, false)).toBeNull();
    expect(nextSleep({ kind: "chapter", end: 3 }, true)).toBeNull();
  });

  it("labels what's left", () => {
    expect(sleepLabel({ kind: "minutes", minutes: 15, at: 65_000 }, 0)).toBe("1:05");
    expect(sleepLabel({ kind: "minutes", minutes: 15, at: 0 }, 5000)).toBe("0:00");
    expect(sleepLabel({ kind: "chapter", end: 3 }, 0)).toBe("End of chapter");
  });
});
