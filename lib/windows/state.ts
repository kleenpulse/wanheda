import { isWindowId, type WindowId } from "@/lib/modules";
import { parsePlacement, type Placement } from "./geometry";

// What the window store keeps per device: where each window was last put
// (remembered after it closes) and which are open, bottom to top. Positions
// are per device on purpose: a place on a 27-inch screen means nothing on a
// laptop, so they live in localStorage, not the database.

export interface WindowsSnapshot {
  placements: Partial<Record<WindowId, Placement>>;
  /** Open windows in stacking order: the last one is on top. */
  open: WindowId[];
}

export const EMPTY_WINDOWS: WindowsSnapshot = { placements: {}, open: [] };

// The stacking helpers are generic over the id so they hold for any set of windows.

/** Opens `id`, or brings it to the top if it is already open. */
export function raise<T extends string>(open: readonly T[], id: T): T[] {
  return [...open.filter((w) => w !== id), id];
}

export function lower<T extends string>(open: readonly T[], id: T): T[] {
  return open.filter((w) => w !== id);
}

export function isOnTop<T extends string>(open: readonly T[], id: T): boolean {
  return open.at(-1) === id;
}

/** A stored snapshot read back: unknown windows, bad rects and duplicates dropped. */
export function sanitizeWindows(raw: unknown): WindowsSnapshot {
  if (typeof raw !== "object" || raw === null) return EMPTY_WINDOWS;
  const r = raw as Record<string, unknown>;

  const placements: Partial<Record<WindowId, Placement>> = {};
  if (typeof r.placements === "object" && r.placements !== null) {
    for (const [id, value] of Object.entries(r.placements)) {
      const p = parsePlacement(value);
      if (p && isWindowId(id)) placements[id] = p;
    }
  }

  const open: WindowId[] = [];
  if (Array.isArray(r.open)) {
    for (const id of r.open) {
      if (typeof id === "string" && isWindowId(id) && !open.includes(id)) open.push(id);
    }
  }
  return { placements, open };
}
