import { describe, expect, it } from "vitest";
import { continueList, layProgress, watchLaterList, writesDue } from "./playback";
import { seedMedia } from "./seed";
import type { MediaItem } from "./types";

const items = seedMedia(Date.parse("2026-11-07T12:00:00Z"));
const [a, b, c] = items as [MediaItem, MediaItem, MediaItem];
const at = (iso: string) => Date.parse(iso);

describe("layProgress", () => {
  it("this device's newer copy wins; an older one doesn't", () => {
    const server = { ...a, progress: { positionS: 100, watched: false, lastPlayedAt: "2026-11-07T10:00:00.000Z" } };
    const newer = layProgress([server], { [a.id]: { positionS: 200, watched: false, at: at("2026-11-07T11:00:00Z") } });
    expect(newer[0]?.progress?.positionS).toBe(200);
    const older = layProgress([server], { [a.id]: { positionS: 50, watched: false, at: at("2026-11-07T09:00:00Z") } });
    expect(older[0]).toBe(server);
  });

  it("fills an item the server has no progress for", () => {
    expect(layProgress([a], { [a.id]: { positionS: 30, watched: false, at: 1 } })[0]?.progress?.positionS).toBe(30);
  });
});

describe("lists", () => {
  it("continue: started, unwatched, past 10 s, newest first", () => {
    const list = continueList([
      { ...a, progress: { positionS: 40, watched: false, lastPlayedAt: "2026-11-07T10:00:00.000Z" } },
      { ...b, progress: { positionS: 15, watched: false, lastPlayedAt: "2026-11-07T11:00:00.000Z" } },
      { ...c, progress: { positionS: 90, watched: true, lastPlayedAt: "2026-11-07T12:00:00.000Z" } },
    ]);
    expect(list.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(continueList([{ ...a, progress: { positionS: 5, watched: false, lastPlayedAt: "2026-11-07T10:00:00.000Z" } }])).toEqual([]);
    // Inside the last 30 s it would open at 0, so it isn't listed (b is the 52 s trailer).
    expect(continueList([{ ...b, progress: { positionS: 31, watched: false, lastPlayedAt: "2026-11-07T10:00:00.000Z" } }])).toEqual([]);
  });

  it("watch later: queued and unwatched, oldest first", () => {
    const list = watchLaterList([
      { ...a, watchLaterAt: "2026-11-07T11:00:00.000Z" },
      { ...b, watchLaterAt: "2026-11-07T10:00:00.000Z" },
      { ...c, watchLaterAt: "2026-11-07T09:00:00.000Z", progress: { positionS: 1, watched: true, lastPlayedAt: "2026-11-07T12:00:00.000Z" } },
    ]);
    expect(list.map((i) => i.id)).toEqual([b.id, a.id]);
  });
});

describe("writesDue", () => {
  it("ticks write locally every 5 s and to the server every 15 s", () => {
    expect(writesDue(4_999, { local: 0, server: 0 }, "tick")).toEqual({ local: false, server: false });
    expect(writesDue(5_000, { local: 0, server: 0 }, "tick")).toEqual({ local: true, server: false });
    expect(writesDue(15_000, { local: 10_000, server: 0 }, "tick")).toEqual({ local: true, server: true });
  });

  it("pause, end and hide write both at once", () => {
    for (const r of ["pause", "ended", "hidden"] as const) expect(writesDue(1, { local: 0, server: 0 }, r)).toEqual({ local: true, server: true });
  });
});
