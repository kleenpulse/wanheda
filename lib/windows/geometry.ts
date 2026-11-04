import type { WindowSize } from "@/lib/modules";

// Mini-window geometry (FR-SHELL-5). Pure: every function takes the layer's
// size, so the tests need no DOM. Rects are px from the layer's top-left.
//
// A window that lands near an edge snaps to it and remembers which edge
// (`snapX` / `snapY`), not the pixel offset: snapped to the right, it stays
// on the right when the rail opens or the window is resized. Unsnapped
// windows keep their offset and are clamped back on screen.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  w: number;
  h: number;
}

export type Snap = "start" | "end" | null;

/** What is stored per window. */
export interface Placement extends Rect {
  snapX: Snap;
  snapY: Snap;
}

/** Gap kept between a window and the layer edge. */
export const MARGIN = 12;
/** A pointer drop this close to an edge snaps to it. */
export const SNAP_DISTANCE = 24;
/** One arrow-key step, for moving and resizing. */
export const STEP = 16;
/** Cascade offset for each further window opened without a saved place. */
const CASCADE = 32;

export type Direction = "left" | "right" | "up" | "down";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/** Size clamped to the window's minimum and to the room the layer has. */
export function clampSize(w: number, h: number, size: WindowSize, bounds: Bounds): Pick<Rect, "w" | "h"> {
  const roomW = Math.max(1, bounds.w - 2 * MARGIN);
  const roomH = Math.max(1, bounds.h - 2 * MARGIN);
  return {
    w: Math.round(Math.min(Math.max(w, size.minW), roomW)),
    h: Math.round(Math.min(Math.max(h, size.minH), roomH)),
  };
}

/** Where a stored placement sits on a layer of this size. Always fully on screen when it fits. */
export function resolveRect(p: Placement, size: WindowSize, bounds: Bounds): Rect {
  const { w, h } = clampSize(p.w, p.h, size, bounds);
  const maxX = bounds.w - MARGIN - w;
  const maxY = bounds.h - MARGIN - h;
  const x = p.snapX === "start" ? MARGIN : p.snapX === "end" ? maxX : p.x;
  const y = p.snapY === "start" ? MARGIN : p.snapY === "end" ? maxY : p.y;
  return { x: Math.round(clamp(x, MARGIN, maxX)), y: Math.round(clamp(y, MARGIN, maxY)), w, h };
}

function snapAxis(pos: number, len: number, room: number, distance: number): { pos: number; snap: Snap } {
  const max = room - MARGIN - len;
  const p = clamp(pos, MARGIN, max);
  if (p - MARGIN <= distance) return { pos: MARGIN, snap: "start" };
  if (max - p <= distance) return { pos: max, snap: "end" };
  return { pos: Math.round(p), snap: null };
}

/**
 * Turns a rect the owner just dropped (or resized) into a placement: on
 * screen, at least its minimum size, and snapped to any edge within
 * `distance`. Start wins when a window is wide enough to be near both.
 */
export function settle(rect: Rect, size: WindowSize, bounds: Bounds, distance = SNAP_DISTANCE): Placement {
  const { w, h } = clampSize(rect.w, rect.h, size, bounds);
  const sx = snapAxis(rect.x, w, bounds.w, distance);
  const sy = snapAxis(rect.y, h, bounds.h, distance);
  return { x: sx.pos, y: sy.pos, w, h, snapX: sx.snap, snapY: sy.snap };
}

/**
 * Where a window opens the first time: the bottom-right corner, snapped
 * there. When `index` others are already open, each further one steps up and
 * left so none hides another.
 */
export function defaultPlacement(size: WindowSize, bounds: Bounds, index = 0): Placement {
  const corner: Placement = { x: 0, y: 0, w: size.w, h: size.h, snapX: "end", snapY: "end" };
  if (index === 0) return corner;
  const at = resolveRect(corner, size, bounds);
  return settle({ ...at, x: at.x - CASCADE * index, y: at.y - CASCADE * index }, size, bounds, 0);
}

const DELTA: Record<Direction, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/**
 * One keyboard step: move, or resize (right/down grow, left/up shrink). Snaps
 * only on touching an edge, so a step away from a snapped edge is not pulled
 * back. Returns null when the window can't go further.
 */
export function nudgeWindow(
  p: Placement,
  size: WindowSize,
  bounds: Bounds,
  dir: Direction,
  mode: "move" | "resize",
): Placement | null {
  const at = resolveRect(p, size, bounds);
  const [dx, dy] = DELTA[dir];
  const next =
    mode === "move"
      ? { ...at, x: at.x + dx * STEP, y: at.y + dy * STEP }
      : { ...at, w: at.w + dx * STEP, h: at.h + dy * STEP };
  const moved = settle(next, size, bounds, 0);
  // A resize keeps the edges the window is snapped to, so a window on the
  // right grows and shrinks leftward and stays on the right.
  const settled =
    mode === "resize" ? { ...moved, snapX: p.snapX ?? moved.snapX, snapY: p.snapY ?? moved.snapY } : moved;
  const after = resolveRect(settled, size, bounds);
  const same = at.x === after.x && at.y === after.y && at.w === after.w && at.h === after.h;
  return same ? null : settled;
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function snapValue(v: unknown): Snap {
  return v === "start" || v === "end" ? v : null;
}

/** A stored placement read back from localStorage, or null if it is not one. */
export function parsePlacement(raw: unknown): Placement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!finite(r.x) || !finite(r.y) || !finite(r.w) || !finite(r.h) || r.w <= 0 || r.h <= 0) return null;
  return { x: r.x, y: r.y, w: r.w, h: r.h, snapX: snapValue(r.snapX), snapY: snapValue(r.snapY) };
}
