import { bottom, moveElement, verticalCompactor, type LayoutItem } from "react-grid-layout/core";
import { z } from "zod";
import { WIDGETS, isWidgetId, type WidgetDef, type WidgetId } from "@/lib/modules";

// The home board's layout rules (FR-SHELL-2), pure and clock-free. The client
// grid, the server action and the loader all pass through here, so a layout
// from the database, the wire or a drag is cleaned the same way.

/** Board breakpoints, by the board's own width (not the viewport: the rail eats into it). */
export const BREAKPOINTS = { lg: 1024, md: 600, sm: 0 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;
export const BREAKPOINT_NAMES = ["lg", "md", "sm"] as const satisfies readonly Breakpoint[];
export const COLS: Readonly<Record<Breakpoint, number>> = { lg: 12, md: 8, sm: 4 };

export const ROW_HEIGHT = 80;
export const GAP = 16;
const MAX_H = 12;
const MAX_Y = 400;

export interface BoardItem {
  i: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BoardLayouts = Record<Breakpoint, BoardItem[]>;

/**
 * owner: the saved board, saved on change. demo: the seed, never saved.
 * load-failed: the seed standing in for a board that could not be read;
 * never saved, so it cannot overwrite the real one.
 */
export type BoardSource = "owner" | "demo" | "load-failed";

/** What Home prefetches and `GET /api/board` serves, cached on the client under BOARD_KEY. */
export interface BoardPayload {
  source: BoardSource;
  layouts: BoardLayouts;
}

export const BOARD_KEY = ["board"] as const;

const DEFS: ReadonlyMap<string, WidgetDef> = new Map(WIDGETS.map((w) => [w.id, w]));

function defOf(id: WidgetId): WidgetDef {
  const def = DEFS.get(id);
  if (!def) throw new Error(`Unknown widget: ${id}`);
  return def;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** A widget's size limits on a board of `cols` columns. */
export function sizeLimits(id: WidgetId, cols: number) {
  const { size } = defOf(id);
  const maxW = Math.min(size.maxW ?? cols, cols);
  const minW = Math.min(size.minW, maxW);
  return {
    w: clamp(size.w, minW, maxW),
    h: size.h,
    minW,
    maxW,
    minH: size.minH,
    maxH: size.maxH ?? MAX_H,
  };
}

/** The wire shape: the server action and the database both hold this, unvalidated. */
const rawItemSchema = z.object({
  i: z.string().max(64),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export const rawLayoutSchema = z.array(rawItemSchema).max(64);
export const layoutsInputSchema = z.partialRecord(z.enum(BREAKPOINT_NAMES), rawLayoutSchema);
export type RawItem = z.infer<typeof rawItemSchema>;

function pick(item: Pick<LayoutItem, "i" | "x" | "y" | "w" | "h">): BoardItem {
  return { i: item.i as WidgetId, x: item.x, y: item.y, w: item.w, h: item.h };
}

/** Stacks items upwards and pushes overlaps down, as the grid itself does. */
function compact(items: readonly BoardItem[], cols: number): BoardItem[] {
  return verticalCompactor.compact(items, cols).map(pick);
}

/**
 * Cleans a layout: unknown and duplicate widgets dropped, sizes clamped to the
 * widget's limits and the column count, positions kept on the board, overlaps
 * resolved. Idempotent, and stable for a layout that is already clean.
 */
export function sanitizeLayout(raw: readonly RawItem[], bp: Breakpoint): BoardItem[] {
  const cols = COLS[bp];
  const seen = new Set<string>();
  const items: BoardItem[] = [];
  for (const r of raw) {
    if (!isWidgetId(r.i) || seen.has(r.i)) continue;
    seen.add(r.i);
    const lim = sizeLimits(r.i, cols);
    const w = clamp(Math.round(r.w), lim.minW, lim.maxW);
    const h = clamp(Math.round(r.h), lim.minH, lim.maxH);
    items.push({
      i: r.i,
      x: clamp(Math.round(r.x), 0, cols - w),
      y: clamp(Math.round(r.y), 0, MAX_Y),
      w,
      h,
    });
  }
  return compact(items, cols);
}

/** Adds a widget at its default size, at the bottom left of one breakpoint's layout. */
function placeBelow(layout: readonly BoardItem[], id: WidgetId, bp: Breakpoint): BoardItem[] {
  const lim = sizeLimits(id, COLS[bp]);
  return [...layout, { i: id, x: 0, y: bottom(layout), w: lim.w, h: lim.h }];
}

const SEED_RAW: Record<Breakpoint, RawItem[]> = {
  lg: [
    { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
    { i: "home.weather", x: 4, y: 0, w: 4, h: 2 },
    { i: "home.today", x: 8, y: 0, w: 4, h: 4 },
    { i: "home.note", x: 0, y: 2, w: 8, h: 2 },
    { i: "money.today", x: 0, y: 4, w: 4, h: 2 },
    { i: "money.budget", x: 4, y: 4, w: 4, h: 4 },
    { i: "money.renewals", x: 8, y: 4, w: 4, h: 4 },
  ],
  md: [
    { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
    { i: "home.weather", x: 4, y: 0, w: 4, h: 2 },
    { i: "home.today", x: 0, y: 2, w: 4, h: 4 },
    { i: "home.note", x: 4, y: 2, w: 4, h: 4 },
    { i: "money.today", x: 0, y: 6, w: 4, h: 2 },
    { i: "money.budget", x: 4, y: 6, w: 4, h: 4 },
    { i: "money.renewals", x: 0, y: 8, w: 4, h: 4 },
  ],
  sm: [
    { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
    { i: "home.weather", x: 0, y: 2, w: 4, h: 2 },
    { i: "home.today", x: 0, y: 4, w: 4, h: 4 },
    { i: "home.note", x: 0, y: 8, w: 4, h: 3 },
    { i: "money.today", x: 0, y: 11, w: 4, h: 2 },
    { i: "money.budget", x: 0, y: 13, w: 4, h: 4 },
    { i: "money.renewals", x: 0, y: 17, w: 4, h: 4 },
  ],
};

/** The starting board: demo mode, and an owner who has never saved one. */
export function seedLayouts(): BoardLayouts {
  return {
    lg: sanitizeLayout(SEED_RAW.lg, "lg"),
    md: sanitizeLayout(SEED_RAW.md, "md"),
    sm: sanitizeLayout(SEED_RAW.sm, "sm"),
  };
}

/**
 * Builds the board from stored rows (breakpoint → layout json, unvalidated).
 * Nothing stored means the seed. Otherwise the widgets on the board are the
 * union of the stored layouts; a breakpoint never saved starts from the seed,
 * and a widget missing from one breakpoint is placed at its bottom. An empty
 * stored board stays empty: the owner removed everything.
 */
export function resolveLayouts(stored: Readonly<Record<string, unknown>> | null): BoardLayouts {
  const parsed: Partial<Record<Breakpoint, BoardItem[]>> = {};
  for (const bp of BREAKPOINT_NAMES) {
    const result = rawLayoutSchema.safeParse(stored?.[bp]);
    if (result.success) parsed[bp] = sanitizeLayout(result.data, bp);
  }
  const saved = BREAKPOINT_NAMES.filter((bp) => parsed[bp] !== undefined);
  if (saved.length === 0) return seedLayouts();

  const onBoard = new Set<WidgetId>(saved.flatMap((bp) => (parsed[bp] ?? []).map((item) => item.i)));
  const seed = seedLayouts();
  const out = {} as BoardLayouts;
  for (const bp of BREAKPOINT_NAMES) {
    let layout = (parsed[bp] ?? seed[bp]).filter((item) => onBoard.has(item.i));
    for (const id of onBoard) {
      if (!layout.some((item) => item.i === id)) layout = placeBelow(layout, id, bp);
    }
    out[bp] = sanitizeLayout(layout, bp);
  }
  return out;
}

/** The widgets on the board, in picker order. */
export function widgetsOn(layouts: BoardLayouts): WidgetId[] {
  const ids = new Set(BREAKPOINT_NAMES.flatMap((bp) => layouts[bp].map((item) => item.i)));
  return WIDGETS.map((w) => w.id).filter((id) => ids.has(id));
}

/** Adds a widget to every breakpoint (a no-op if it is already there). */
export function addWidget(layouts: BoardLayouts, id: WidgetId): BoardLayouts {
  const out = {} as BoardLayouts;
  for (const bp of BREAKPOINT_NAMES) {
    const layout = layouts[bp];
    out[bp] = layout.some((item) => item.i === id) ? layout : sanitizeLayout(placeBelow(layout, id, bp), bp);
  }
  return out;
}

/** Removes a widget from every breakpoint and closes the gap. */
export function removeWidget(layouts: BoardLayouts, id: WidgetId): BoardLayouts {
  const out = {} as BoardLayouts;
  for (const bp of BREAKPOINT_NAMES) {
    out[bp] = compact(
      layouts[bp].filter((item) => item.i !== id),
      COLS[bp],
    );
  }
  return out;
}

function samePlaces(a: readonly BoardItem[], b: readonly BoardItem[]): boolean {
  return a.every((item) => {
    const other = b.find((o) => o.i === item.i);
    return other?.x === item.x && other.y === item.y && other.w === item.w && other.h === item.h;
  });
}

export type KeyAction = "left" | "right" | "up" | "down";

/**
 * Keyboard move and resize for one widget (drag has no keyboard path). A move
 * keeps stepping until the compacted board actually changes, so Down jumps
 * past the widget below instead of floating straight back. Null: no change.
 */
export function nudge(
  layout: readonly BoardItem[],
  id: WidgetId,
  action: KeyAction,
  mode: "move" | "resize",
  bp: Breakpoint,
): BoardItem[] | null {
  const cols = COLS[bp];
  const item = layout.find((l) => l.i === id);
  if (!item) return null;
  const dx = action === "left" ? -1 : action === "right" ? 1 : 0;
  const dy = action === "up" ? -1 : action === "down" ? 1 : 0;

  if (mode === "resize") {
    const lim = sizeLimits(id, cols);
    const w = clamp(item.w + dx, lim.minW, Math.min(lim.maxW, cols - item.x));
    const h = clamp(item.h + dy, lim.minH, lim.maxH);
    if (w === item.w && h === item.h) return null;
    // The resized widget goes first, so its neighbours are the ones pushed down.
    const resized = { ...item, w, h };
    const next = compact([resized, ...layout.filter((l) => l.i !== id)], cols);
    return samePlaces(next, layout) ? null : next;
  }

  const maxSteps = dy > 0 ? bottom(layout) + 1 : Math.max(cols, item.y + 1);
  for (let step = 1; step <= maxSteps; step++) {
    const x = item.x + dx * step;
    const y = item.y + dy * step;
    if (x < 0 || x + item.w > cols || y < 0) return null;
    // moveElement mutates the items it moves and pushes: work on a copy.
    const copy = layout.map((l) => ({ ...l }));
    const target = copy.find((l) => l.i === id) ?? { ...item };
    const moved = moveElement(copy, target, x, y, true, false, "vertical", cols);
    const next = compact(moved.map(pick), cols);
    if (!samePlaces(next, layout)) return next;
  }
  return null;
}
