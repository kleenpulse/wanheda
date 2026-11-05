import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  GRID,
  ZOOM_MAX,
  clampPlace,
  fitCamera,
  layoutBoard,
  nudgePlace,
  parseCamera,
  placeAtCenter,
  settlePlace,
  showsAny,
} from "./board";
import { STICKY_MAX, STICKY_MIN, STICKY_SIZE, draftNote, noteWriteSchema, writeOf, type BoardPlace, type Note } from "./notes";

const NOW = 1_800_000_000_000;

function note(n: number, over: Partial<Note> = {}): Note {
  const id = `0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a${String(n).padStart(2, "0")}`;
  return { ...draftNote(id, NOW + n), version: 1, ...over };
}

function overlaps(a: BoardPlace, b: BoardPlace) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("settlePlace", () => {
  it("snaps to the grid and keeps sizes and reach in limits", () => {
    expect(settlePlace({ x: 13, y: -13, w: 250, h: 190 })).toEqual({ x: 24, y: -24, w: 240, h: 192 });
    expect(settlePlace({ x: 0, y: 0, w: 10, h: 10 })).toEqual({ x: 0, y: 0, ...STICKY_MIN });
    expect(settlePlace({ x: 0, y: 0, w: 5000, h: 5000 })).toEqual({ x: 0, y: 0, ...STICKY_MAX });
    expect(clampPlace({ x: 1e9, y: -1e9, w: 240.4, h: 192 }).x).toBe(100_000);
  });

  it("always yields a place the server takes", () => {
    for (const p of [
      { x: 1e9, y: -1e9, w: 0, h: 9999 },
      { x: 0.4, y: 7.7, w: 161, h: 121 },
    ]) {
      const write = { ...writeOf(note(1)), board: settlePlace(p) };
      expect(noteWriteSchema.safeParse(write).success).toBe(true);
    }
  });
});

describe("layoutBoard", () => {
  it("keeps placed notes, flows the rest around them, oldest first, and leaves the archive off", () => {
    const placed = note(5, { board: { x: 0, y: 0, w: 240, h: 192 } });
    const board = layoutBoard([note(3), placed, note(2), note(9, { archived: true })]);
    expect(board.map((s) => s.note.id.slice(-2))).toEqual(["05", "02", "03"]);
    expect(board[0]).toMatchObject({ placed: true, place: placed.board });
    const flowed = board.filter((s) => !s.placed).map((s) => s.place);
    for (const p of flowed) expect(overlaps(p, placed.board as BoardPlace)).toBe(false);
    expect(overlaps(flowed[0] as BoardPlace, flowed[1] as BoardPlace)).toBe(false);
    expect(flowed[0]).toMatchObject({ w: STICKY_SIZE.w, h: STICKY_SIZE.h });
  });

  it("doesn't move older unplaced notes when a new one arrives", () => {
    const before = layoutBoard([note(1), note(2)]);
    const after = layoutBoard([note(3), note(1), note(2)]);
    expect(after.slice(0, 2)).toEqual(before);
  });
});

describe("camera", () => {
  it("fits every sticky, never zooming past 1", () => {
    const view = { w: 1000, h: 600 };
    const one = fitCamera([{ x: 0, y: 0, w: 240, h: 192 }], view);
    expect(one.scale).toBe(1);
    expect(one.x).toBe((1000 - 240) / 2);
    const wide = fitCamera(
      [
        { x: -1000, y: 0, w: 240, h: 192 },
        { x: 1000, y: 400, w: 240, h: 192 },
      ],
      view,
    );
    expect(wide.scale).toBeLessThan(1);
    expect(wide.x + -1000 * wide.scale).toBeGreaterThanOrEqual(47);
    expect(fitCamera([], view)).toEqual(DEFAULT_CAMERA);
  });

  it("puts a new sticky in the middle of the view, on the grid", () => {
    const p = placeAtCenter({ x: 100, y: 50, scale: 2 }, { w: 800, h: 600 });
    expect(p.x % GRID).toBe(0);
    expect(p.y % GRID).toBe(0);
    expect(Math.abs(p.x + p.w / 2 - (400 - 100) / 2)).toBeLessThanOrEqual(GRID);
  });

  it("knows when a camera shows no sticky at all", () => {
    const p = [{ x: 0, y: 0, w: 240, h: 192 }];
    expect(showsAny({ x: 0, y: 0, scale: 1 }, p, { w: 390, h: 800 })).toBe(true);
    expect(showsAny({ x: 400, y: 0, scale: 1 }, p, { w: 390, h: 800 })).toBe(false);
    expect(showsAny({ x: -239, y: 0, scale: 1 }, p, { w: 390, h: 800 })).toBe(true);
    expect(showsAny({ x: 0, y: 0, scale: 1 }, [], { w: 390, h: 800 })).toBe(false);
  });

  it("reads back a stored camera, or the default", () => {
    expect(parseCamera({ x: 1, y: 2, scale: 99 })).toEqual({ x: 1, y: 2, scale: ZOOM_MAX });
    expect(parseCamera({ x: "1", y: 2, scale: 1 })).toEqual(DEFAULT_CAMERA);
    expect(parseCamera({ x: Number.NaN, y: 2, scale: 1 })).toEqual(DEFAULT_CAMERA);
    expect(parseCamera(null)).toEqual(DEFAULT_CAMERA);
  });
});

describe("nudgePlace", () => {
  const p = { x: 0, y: 0, w: 240, h: 192 };
  it("moves a grid step, or resizes with Shift, inside the limits", () => {
    expect(nudgePlace(p, "left", false)).toEqual({ ...p, x: -GRID });
    expect(nudgePlace(p, "down", false)).toEqual({ ...p, y: GRID });
    expect(nudgePlace(p, "right", true)).toEqual({ ...p, w: 240 + GRID });
    expect(nudgePlace({ ...p, w: STICKY_MIN.w }, "left", true).w).toBe(STICKY_MIN.w);
  });
});
