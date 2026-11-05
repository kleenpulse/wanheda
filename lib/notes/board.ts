import { BOARD_REACH, STICKY_MAX, STICKY_MIN, STICKY_SIZE, type BoardPlace, type Note } from "./notes";

// The notes board (FR-NOTES-2), the pure part: snapping, limits, where a
// sticky that was never placed goes, and the camera. The canvas component
// draws; everything here is testable without a DOM.

/** Board grid in board px. Drops snap to it; keyboard moves step by it. */
export const GRID = 24;
const GAP = GRID;
/** Unplaced stickies flow into this many columns from the origin. */
const FLOW_COLUMNS = 4;

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.5;

export function snap(n: number, grid = GRID): number {
  return Math.round(n / grid) * grid;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A place the server will take: whole px, inside the board's reach and the sticky size limits. */
export function clampPlace(p: BoardPlace): BoardPlace {
  return {
    x: Math.round(clamp(p.x, -BOARD_REACH, BOARD_REACH)),
    y: Math.round(clamp(p.y, -BOARD_REACH, BOARD_REACH)),
    w: Math.round(clamp(p.w, STICKY_MIN.w, STICKY_MAX.w)),
    h: Math.round(clamp(p.h, STICKY_MIN.h, STICKY_MAX.h)),
  };
}

/** Snapped to the grid, then clamped. What a drop or a resize commits. */
export function settlePlace(p: BoardPlace): BoardPlace {
  return clampPlace({ x: snap(p.x), y: snap(p.y), w: snap(p.w), h: snap(p.h) });
}

function overlaps(a: BoardPlace, b: BoardPlace): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface Sticky {
  note: Note;
  place: BoardPlace;
  /** False when the board chose the place: the note has none of its own yet. */
  placed: boolean;
}

/**
 * Every note on the board: the archive stays off it. Placed notes sit where
 * the owner put them; the rest flow into a grid from the origin, oldest
 * first, skipping cells a placed note covers. Oldest first so a new note
 * never shifts the others.
 */
export function layoutBoard(notes: readonly Note[]): Sticky[] {
  const live = notes.filter((n) => !n.archived);
  const placed: Sticky[] = [];
  const unplaced: Note[] = [];
  for (const n of live) {
    if (n.board) placed.push({ note: n, place: n.board, placed: true });
    else unplaced.push(n);
  }
  unplaced.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const taken = placed.map((s) => s.place);
  const flowed: Sticky[] = [];
  let cell = 0;
  for (const note of unplaced) {
    let place: BoardPlace;
    // Bounded: each placed note can cover only a few cells.
    for (;;) {
      place = {
        x: (cell % FLOW_COLUMNS) * (STICKY_SIZE.w + GAP),
        y: Math.floor(cell / FLOW_COLUMNS) * (STICKY_SIZE.h + GAP),
        w: STICKY_SIZE.w,
        h: STICKY_SIZE.h,
      };
      cell++;
      if (!taken.some((t) => overlaps(t, place))) break;
    }
    flowed.push({ note, place, placed: false });
  }
  return [...placed, ...flowed];
}

export interface Camera {
  /** Screen px of the board origin, from the canvas's top left. */
  x: number;
  y: number;
  scale: number;
}

export const DEFAULT_CAMERA: Camera = { x: GRID, y: GRID, scale: 1 };

export function clampScale(scale: number): number {
  return clamp(scale, ZOOM_MIN, ZOOM_MAX);
}

/** The camera that shows every sticky with some margin, never zoomed past 1. */
export function fitCamera(places: readonly BoardPlace[], view: { w: number; h: number }, margin = 48): Camera {
  if (!places.length || view.w <= 0 || view.h <= 0) return DEFAULT_CAMERA;
  const minX = Math.min(...places.map((p) => p.x));
  const minY = Math.min(...places.map((p) => p.y));
  const maxX = Math.max(...places.map((p) => p.x + p.w));
  const maxY = Math.max(...places.map((p) => p.y + p.h));
  const scale = clampScale(Math.min(1, (view.w - margin * 2) / (maxX - minX), (view.h - margin * 2) / (maxY - minY)));
  return {
    x: (view.w - (maxX - minX) * scale) / 2 - minX * scale,
    y: (view.h - (maxY - minY) * scale) / 2 - minY * scale,
    scale,
  };
}

/** A new sticky's place: centred in the view, snapped. */
export function placeAtCenter(camera: Camera, view: { w: number; h: number }): BoardPlace {
  const cx = (view.w / 2 - camera.x) / camera.scale;
  const cy = (view.h / 2 - camera.y) / camera.scale;
  return settlePlace({ x: cx - STICKY_SIZE.w / 2, y: cy - STICKY_SIZE.h / 2, w: STICKY_SIZE.w, h: STICKY_SIZE.h });
}

/** A camera read back from storage, or the default. */
export function parseCamera(raw: unknown): Camera {
  if (typeof raw !== "object" || raw === null) return DEFAULT_CAMERA;
  const { x, y, scale } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || typeof scale !== "number") return DEFAULT_CAMERA;
  if (![x, y, scale].every(Number.isFinite)) return DEFAULT_CAMERA;
  return { x, y, scale: clampScale(scale) };
}

export type StickyKey = "left" | "right" | "up" | "down";

/** Arrow keys on a sticky: move a grid step, or with Shift resize by one. */
export function nudgePlace(p: BoardPlace, key: StickyKey, resize: boolean): BoardPlace {
  const dx = key === "left" ? -GRID : key === "right" ? GRID : 0;
  const dy = key === "up" ? -GRID : key === "down" ? GRID : 0;
  return settlePlace(resize ? { ...p, w: p.w + dx, h: p.h + dy } : { ...p, x: p.x + dx, y: p.y + dy });
}

/** Whether any sticky is at least partly in view through this camera. */
export function showsAny(camera: Camera, places: readonly BoardPlace[], view: { w: number; h: number }): boolean {
  return places.some((p) => {
    const left = camera.x + p.x * camera.scale;
    const top = camera.y + p.y * camera.scale;
    return left < view.w && top < view.h && left + p.w * camera.scale > 0 && top + p.h * camera.scale > 0;
  });
}
