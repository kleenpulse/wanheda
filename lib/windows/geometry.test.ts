import { describe, expect, it } from "vitest";
import {
  MARGIN,
  STEP,
  clampSize,
  defaultPlacement,
  nudgeWindow,
  parsePlacement,
  resolveRect,
  settle,
  type Bounds,
  type Placement,
  type Rect,
} from "./geometry";

const SIZE = { w: 320, h: 360, minW: 260, minH: 220 };
const SCREEN: Bounds = { w: 1200, h: 800 };

function free(x: number, y: number, w = SIZE.w, h = SIZE.h): Placement {
  return { x, y, w, h, snapX: null, snapY: null };
}

function onScreen(r: Rect, b: Bounds) {
  expect(r.x).toBeGreaterThanOrEqual(MARGIN);
  expect(r.y).toBeGreaterThanOrEqual(MARGIN);
  expect(r.x + r.w).toBeLessThanOrEqual(b.w - MARGIN);
  expect(r.y + r.h).toBeLessThanOrEqual(b.h - MARGIN);
}

describe("clampSize", () => {
  it("holds the minimum and the room the layer has", () => {
    expect(clampSize(100, 100, SIZE, SCREEN)).toEqual({ w: 260, h: 220 });
    expect(clampSize(5000, 5000, SIZE, SCREEN)).toEqual({ w: 1200 - 2 * MARGIN, h: 800 - 2 * MARGIN });
  });

  it("lets the screen win over the minimum on a tiny layer", () => {
    expect(clampSize(320, 360, SIZE, { w: 200, h: 180 })).toEqual({ w: 200 - 2 * MARGIN, h: 180 - 2 * MARGIN });
  });
});

describe("resolveRect", () => {
  it("puts snapped edges on the margin, wherever the layer is", () => {
    const corner: Placement = { ...free(0, 0), snapX: "end", snapY: "end" };
    expect(resolveRect(corner, SIZE, SCREEN)).toEqual({ x: 1200 - MARGIN - 320, y: 800 - MARGIN - 360, w: 320, h: 360 });
    const narrower = { w: 900, h: 800 };
    expect(resolveRect(corner, SIZE, narrower).x).toBe(900 - MARGIN - 320);
  });

  it("keeps an unsnapped window's offset, and clamps it back on screen", () => {
    expect(resolveRect(free(300, 200), SIZE, SCREEN)).toMatchObject({ x: 300, y: 200 });
    const r = resolveRect(free(1100, 700), SIZE, { w: 800, h: 600 });
    onScreen(r, { w: 800, h: 600 });
  });
});

describe("settle", () => {
  it("snaps a drop near an edge, and only near one", () => {
    expect(settle({ x: 20, y: 300, w: 320, h: 360 }, SIZE, SCREEN)).toMatchObject({ x: MARGIN, snapX: "start", snapY: null });
    const right = settle({ x: 1200 - 320 - 30, y: 300, w: 320, h: 360 }, SIZE, SCREEN);
    expect(right).toMatchObject({ x: 1200 - MARGIN - 320, snapX: "end" });
    expect(settle({ x: 400, y: 300, w: 320, h: 360 }, SIZE, SCREEN)).toMatchObject({ x: 400, y: 300, snapX: null, snapY: null });
  });

  it("pulls a window dragged off screen back on, snapped to the edge it crossed", () => {
    const p = settle({ x: -200, y: 900, w: 320, h: 360 }, SIZE, SCREEN);
    expect(p).toMatchObject({ snapX: "start", snapY: "end" });
    onScreen(resolveRect(p, SIZE, SCREEN), SCREEN);
  });

  it("is idempotent", () => {
    for (const r of [
      { x: 20, y: 40, w: 300, h: 300 },
      { x: 500, y: 300, w: 400, h: 250 },
      { x: 2000, y: -50, w: 100, h: 100 },
    ]) {
      const once = settle(r, SIZE, SCREEN);
      expect(settle(resolveRect(once, SIZE, SCREEN), SIZE, SCREEN)).toEqual(once);
    }
  });
});

describe("defaultPlacement", () => {
  it("opens the first window in the bottom-right corner, snapped", () => {
    expect(defaultPlacement(SIZE, SCREEN)).toMatchObject({ snapX: "end", snapY: "end" });
  });

  it("cascades further windows up and left, on screen", () => {
    const first = resolveRect(defaultPlacement(SIZE, SCREEN, 0), SIZE, SCREEN);
    const second = resolveRect(defaultPlacement(SIZE, SCREEN, 1), SIZE, SCREEN);
    expect(second.x).toBeLessThan(first.x);
    expect(second.y).toBeLessThan(first.y);
    onScreen(second, SCREEN);
  });
});

describe("nudgeWindow", () => {
  it("moves one step, and a step away from a snapped edge is not pulled back", () => {
    const left: Placement = { ...free(MARGIN, 300), snapX: "start" };
    const moved = nudgeWindow(left, SIZE, SCREEN, "right", "move");
    expect(moved).toMatchObject({ x: MARGIN + STEP, snapX: null });
  });

  it("snaps when a step touches an edge", () => {
    const near = free(MARGIN + 5, 300);
    expect(nudgeWindow(near, SIZE, SCREEN, "left", "move")).toMatchObject({ x: MARGIN, snapX: "start" });
  });

  it("returns null at the edge, and at the size limits", () => {
    const left: Placement = { ...free(MARGIN, 300), snapX: "start" };
    expect(nudgeWindow(left, SIZE, SCREEN, "left", "move")).toBeNull();
    expect(nudgeWindow(free(400, 300, SIZE.minW, SIZE.minH), SIZE, SCREEN, "left", "resize")).toBeNull();
  });

  it("resizes a right-snapped window leftward, keeping it on the right", () => {
    const right: Placement = { ...free(0, 300), snapX: "end" };
    const before = resolveRect(right, SIZE, SCREEN);
    const smaller = nudgeWindow(right, SIZE, SCREEN, "left", "resize");
    expect(smaller).not.toBeNull();
    if (!smaller) return;
    const after = resolveRect(smaller, SIZE, SCREEN);
    expect(after.w).toBe(before.w - STEP);
    expect(after.x + after.w).toBe(before.x + before.w);
    const bigger = nudgeWindow(right, SIZE, SCREEN, "right", "resize");
    expect(bigger && resolveRect(bigger, SIZE, SCREEN).x + SIZE.w + STEP).toBe(1200 - MARGIN);
  });
});

describe("parsePlacement", () => {
  it("accepts a stored placement and drops anything else", () => {
    expect(parsePlacement({ x: 1, y: 2, w: 3, h: 4, snapX: "end", snapY: "sideways" })).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      snapX: "end",
      snapY: null,
    });
    expect(parsePlacement({ x: 1, y: 2, w: 0, h: 4 })).toBeNull();
    expect(parsePlacement({ x: "1", y: 2, w: 3, h: 4 })).toBeNull();
    expect(parsePlacement({ x: Number.NaN, y: 2, w: 3, h: 4 })).toBeNull();
    expect(parsePlacement(null)).toBeNull();
  });
});
