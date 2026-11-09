import { describe, expect, test } from "vitest";
import { ISLAND_SIZE, islandPosition, MAX_ITEMS, overIsland, parseIslandCommand, parseIslandReport, parseIslandSnapshot, shouldShowIsland } from "./island";

const media = { kind: "media", id: "media", title: "Song", artist: "Band", coverKey: "abc123", playing: true, startedAt: 5 };
const speech = { kind: "speech", id: "speech", title: "A note", progress: 0.4, paused: false, path: "/notes?n=1", startedAt: 9 };
const transfer = { kind: "transfer", id: "transfer:amy", label: "Amy", detail: "Downloading, 40%", progress: 0.4, failed: false };
const alert = { kind: "alert", id: "money:n1", noticeId: "n1", tag: "money", title: "Budget at 80 %", body: "Groceries", path: "/money/budgets" };
const snap = (items: unknown[]) => ({ items, lastTimer: null, lastTimerAt: 0 });

describe("parseIslandSnapshot", () => {
  test("every kind, as sent", () => {
    expect(parseIslandSnapshot(snap([media, speech, transfer, alert]))).toEqual(snap([media, speech, transfer, alert]));
    expect(parseIslandSnapshot({ items: [], lastTimer: "t1", lastTimerAt: 12 })).toEqual({ items: [], lastTimer: "t1", lastTimerAt: 12 });
  });

  test("a path main may not open isn't followed; the item stays", () => {
    expect(parseIslandSnapshot(snap([{ ...alert, path: "/api/auth/sign-out" }]))?.items[0]).toMatchObject({ path: null });
    expect(parseIslandSnapshot(snap([{ ...speech, path: "https://evil.test" }]))?.items[0]).toMatchObject({ path: null });
  });

  test("one bad item drops the whole snapshot", () => {
    for (const bad of [
      { ...media, coverKey: "../../etc" },
      { ...media, playing: "yes" },
      { ...speech, progress: 1.5 },
      { ...speech, path: 5 },
      { ...transfer, progress: Number.NaN },
      { ...alert, tag: "mail" },
      { ...alert, body: "x".repeat(301) },
      { ...media, kind: "video" },
      { ...media, id: "" },
    ]) {
      expect(parseIslandSnapshot(snap([alert, bad])), JSON.stringify(bad)).toBeNull();
    }
    expect(parseIslandSnapshot(snap([media, media]))).toBeNull();
    expect(parseIslandSnapshot(snap(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ ...transfer, id: `t${String(i)}` }))))).toBeNull();
    expect(parseIslandSnapshot({ items: [], lastTimer: 3, lastTimerAt: 0 })).toBeNull();
    expect(parseIslandSnapshot(null)).toBeNull();
  });
});

describe("parseIslandCommand", () => {
  test("the four kinds", () => {
    expect(parseIslandCommand({ kind: "music", action: "next" })).toEqual({ kind: "music", action: "next" });
    expect(parseIslandCommand({ kind: "speech", action: "stop" })).toEqual({ kind: "speech", action: "stop" });
    expect(parseIslandCommand({ kind: "dismiss", noticeId: "n1" })).toEqual({ kind: "dismiss", noticeId: "n1" });
    expect(parseIslandCommand({ kind: "open", path: "/income" })).toEqual({ kind: "open", path: "/income" });
  });

  test("anything else, or anything extra, is refused", () => {
    for (const bad of [
      { kind: "music", action: "seek" },
      { kind: "music", action: "next", extra: 1 },
      { kind: "speech", action: "next" },
      { kind: "dismiss", noticeId: "" },
      { kind: "open", path: "/api/auth/sign-out" },
      { kind: "open", path: "https://evil.test" },
      { kind: "quit" },
      "open",
      null,
    ]) {
      expect(parseIslandCommand(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("parseIslandReport", () => {
  test("content and a rect inside the window", () => {
    expect(parseIslandReport({ content: true, rect: { x: 10, y: 8, width: 200, height: 36 } })).toEqual({ content: true, rect: { x: 10, y: 8, width: 200, height: 36 } });
    expect(parseIslandReport({ content: false, rect: null })).toEqual({ content: false, rect: null });
  });

  test("a rect outside the window or not numbers is refused", () => {
    expect(parseIslandReport({ content: true, rect: { x: -1, y: 0, width: 10, height: 10 } })).toBeNull();
    expect(parseIslandReport({ content: true, rect: { x: 0, y: 0, width: ISLAND_SIZE.width + 1, height: 10 } })).toBeNull();
    expect(parseIslandReport({ content: true, rect: { x: 0, y: 0, width: "10", height: 10 } })).toBeNull();
    expect(parseIslandReport({ content: "yes", rect: null })).toBeNull();
  });
});

describe("shouldShowIsland", () => {
  const base = { enabled: true, content: true, mainVisible: true, mainMinimized: false, mainFocused: false, quitting: false };

  test("only while the main window is out of the way", () => {
    expect(shouldShowIsland(base)).toBe(true);
    expect(shouldShowIsland({ ...base, mainVisible: false, mainFocused: false })).toBe(true);
    expect(shouldShowIsland({ ...base, mainMinimized: true, mainFocused: false })).toBe(true);
    expect(shouldShowIsland({ ...base, mainFocused: true })).toBe(false);
  });

  test("never when turned off, empty or quitting", () => {
    expect(shouldShowIsland({ ...base, enabled: false })).toBe(false);
    expect(shouldShowIsland({ ...base, content: false })).toBe(false);
    expect(shouldShowIsland({ ...base, quitting: true })).toBe(false);
  });
});

describe("placement and hit-testing", () => {
  test("top centre of the work area", () => {
    expect(islandPosition({ x: 1920, y: 40, width: 1920, height: 1000 })).toEqual({ x: 1920 + (1920 - ISLAND_SIZE.width) / 2, y: 40 });
  });

  test("over the island's rect only", () => {
    const rect = { x: 100, y: 8, width: 200, height: 36 };
    expect(overIsland({ x: 1110, y: 20 }, { x: 1000, y: 0 }, rect)).toBe(true);
    expect(overIsland({ x: 1099, y: 20 }, { x: 1000, y: 0 }, rect)).toBe(false);
    expect(overIsland({ x: 1300, y: 20 }, { x: 1000, y: 0 }, rect)).toBe(false);
    expect(overIsland({ x: 1110, y: 44 }, { x: 1000, y: 0 }, rect)).toBe(false);
    expect(overIsland({ x: 1110, y: 20 }, { x: 1000, y: 0 }, null)).toBe(false);
  });
});
