import { openPath } from "./bridge";

/*
 * The floating island (SPEC V70, T77), pure: what crosses between the main
 * window's page, main and the island window, and the rules for showing and
 * hit-testing it. The page sends a snapshot of what's live (media, speech,
 * transfers, alerts; timers travel through the shared activity store like a
 * second tab), main checks it and hands it to the island window, and the
 * island's buttons come back as commands. A drag along its row comes back the
 * same way. Anything malformed is dropped whole.
 */

export const ISLAND_PATH = "/island";

/** The island window's size: room for the widest card and its shadow. Clicks pass through everywhere but the island itself. */
export const ISLAND_SIZE = { width: 420, height: 360 } as const;

export const MAX_ITEMS = 24;
const MAX_TEXT = 200;
const MAX_ID = 120;
const COVER_KEY = /^[A-Za-z0-9:_.-]{1,128}$/;

export type IslandItem =
  | { kind: "media"; id: string; title: string; artist: string; coverKey: string | null; playing: boolean; startedAt: number }
  | { kind: "speech"; id: string; title: string; progress: number; paused: boolean; path: string | null; startedAt: number }
  | { kind: "transfer"; id: string; label: string; detail: string; progress: number | null; failed: boolean }
  | { kind: "alert"; id: string; noticeId: string; tag: "money" | "income"; title: string; body: string; path: string | null };

export type IslandSnapshot = {
  items: IslandItem[];
  /** The timer started last, for the island's order (timers come from the shared activity store). */
  lastTimer: string | null;
  lastTimerAt: number;
};

export const EMPTY_SNAPSHOT: IslandSnapshot = { items: [], lastTimer: null, lastTimerAt: 0 };

const text = (v: unknown, max = MAX_TEXT): v is string => typeof v === "string" && v.length <= max;
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
const time = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const share = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const bool = (v: unknown): v is boolean => typeof v === "boolean";

/** A same-app path main may open, or null; anything else that isn't null fails the item. */
function path(v: unknown): { ok: boolean; path: string | null } {
  if (v === null) return { ok: true, path: null };
  if (typeof v !== "string") return { ok: false, path: null };
  return { ok: true, path: openPath(v) };
}

function parseItem(raw: unknown): IslandItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!id(r.id)) return null;
  switch (r.kind) {
    case "media":
      if (!text(r.title) || !text(r.artist) || !(r.coverKey === null || (typeof r.coverKey === "string" && COVER_KEY.test(r.coverKey))) || !bool(r.playing) || !time(r.startedAt)) return null;
      return { kind: "media", id: r.id, title: r.title, artist: r.artist, coverKey: r.coverKey, playing: r.playing, startedAt: r.startedAt };
    case "speech": {
      const p = path(r.path);
      if (!text(r.title) || !share(r.progress) || !bool(r.paused) || !p.ok || !time(r.startedAt)) return null;
      return { kind: "speech", id: r.id, title: r.title, progress: r.progress, paused: r.paused, path: p.path, startedAt: r.startedAt };
    }
    case "transfer":
      if (!text(r.label) || !text(r.detail) || !(r.progress === null || share(r.progress)) || !bool(r.failed)) return null;
      return { kind: "transfer", id: r.id, label: r.label, detail: r.detail, progress: r.progress, failed: r.failed };
    case "alert": {
      const p = path(r.path);
      if (!id(r.noticeId) || (r.tag !== "money" && r.tag !== "income") || !text(r.title) || !text(r.body, 300) || !p.ok) return null;
      return { kind: "alert", id: r.id, noticeId: r.noticeId, tag: r.tag, title: r.title, body: r.body, path: p.path };
    }
    default:
      return null;
  }
}

/** The page's snapshot if the whole payload is well formed, else null. */
export function parseIslandSnapshot(payload: unknown): IslandSnapshot | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const r = payload as Record<string, unknown>;
  if (!Array.isArray(r.items) || r.items.length > MAX_ITEMS) return null;
  if (!(r.lastTimer === null || id(r.lastTimer)) || !time(r.lastTimerAt)) return null;
  const items: IslandItem[] = [];
  const seen = new Set<string>();
  for (const raw of r.items as unknown[]) {
    const item = parseItem(raw);
    if (!item || seen.has(item.id)) return null;
    seen.add(item.id);
    items.push(item);
  }
  return { items, lastTimer: r.lastTimer, lastTimerAt: r.lastTimerAt };
}

/** What the island's buttons ask for. `open` is main's own; the rest go to the main window's page. */
export type IslandCommand =
  | { kind: "music"; action: "toggle" | "next" | "previous" }
  | { kind: "speech"; action: "toggle" | "stop" }
  | { kind: "dismiss"; noticeId: string }
  | { kind: "open"; path: string };

export function parseIslandCommand(payload: unknown): IslandCommand | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const r = payload as Record<string, unknown>;
  const keys = Object.keys(r).length;
  switch (r.kind) {
    case "music":
      return keys === 2 && (r.action === "toggle" || r.action === "next" || r.action === "previous") ? { kind: "music", action: r.action } : null;
    case "speech":
      return keys === 2 && (r.action === "toggle" || r.action === "stop") ? { kind: "speech", action: r.action } : null;
    case "dismiss":
      return keys === 2 && id(r.noticeId) ? { kind: "dismiss", noticeId: r.noticeId } : null;
    case "open": {
      if (keys !== 2 || typeof r.path !== "string") return null;
      const safe = openPath(r.path);
      return safe ? { kind: "open", path: safe } : null;
    }
    default:
      return null;
  }
}

export type Rect = { x: number; y: number; width: number; height: number };

/** What the island window reports: whether it has anything to show, and where the island sits in it (CSS px). */
export type IslandReport = { content: boolean; rect: Rect | null };

export function parseIslandReport(payload: unknown): IslandReport | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const r = payload as Record<string, unknown>;
  if (!bool(r.content)) return null;
  if (r.rect === null) return { content: r.content, rect: null };
  if (!r.rect || typeof r.rect !== "object") return null;
  const { x, y, width, height } = r.rect as Record<string, unknown>;
  const inside = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  if (!inside(x, ISLAND_SIZE.width) || !inside(y, ISLAND_SIZE.height) || !inside(width, ISLAND_SIZE.width) || !inside(height, ISLAND_SIZE.height)) return null;
  return { content: r.content, rect: { x, y, width, height } };
}

/**
 * Shown while the setting is on, there's something to show, and the main
 * window is out of the way: hidden (tray), minimised or not focused. The
 * page's own island steps aside meanwhile, so there are never two.
 */
export function shouldShowIsland(s: { enabled: boolean; content: boolean; mainVisible: boolean; mainMinimized: boolean; mainFocused: boolean; quitting: boolean }): boolean {
  if (!s.enabled || !s.content || s.quitting) return false;
  return !s.mainVisible || s.mainMinimized || !s.mainFocused;
}

/** A sanity bound on an offset or a drag distance from outside (the settings file, the island's page): wider than any desktop. The real limit is each display's, in `clampIslandOffset`. */
export const MAX_ISLAND_OFFSET = 20_000;

/**
 * How far right (+) or left (−) of top centre the island sits, kept so its
 * window stays inside the work area. The owner drags it along its row (V70);
 * the same offset is used on every display, clamped to each.
 */
export function clampIslandOffset(workArea: Rect, offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  const reach = Math.max(0, Math.floor((workArea.width - ISLAND_SIZE.width) / 2));
  return Math.round(Math.min(reach, Math.max(-reach, offset)));
}

/** The top of a display's work area: centred, moved along that row by `offset`. */
export function islandPosition(workArea: Rect, offset = 0): { x: number; y: number } {
  return { x: Math.round(workArea.x + (workArea.width - ISLAND_SIZE.width) / 2) + clampIslandOffset(workArea, offset), y: Math.round(workArea.y) };
}

/**
 * The offset a drag has reached: `dx` from where the island really stood when
 * the drag began. `from` is the kept offset, which may be past this display's
 * reach (it was set on a wider one): the drag starts from where it is shown,
 * or the first stretch of pointer travel would move nothing.
 */
export function draggedIslandOffset(workArea: Rect, from: number, dx: number): number {
  return clampIslandOffset(workArea, clampIslandOffset(workArea, from) + dx);
}

/** How long a drag may go without a move before the island's hover is tracked again (its page may have lost the pointer, or gone). */
export const ISLAND_DRAG_IDLE_MS = 1000;

/** The island window's drag, as its page sees the pointer: `dx` is how far the pointer is from where the drag began (screen px). */
export type IslandDrag = { phase: "start" } | { phase: "move"; dx: number } | { phase: "end" };

export function parseIslandDrag(payload: unknown): IslandDrag | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const r = payload as Record<string, unknown>;
  const keys = Object.keys(r).length;
  if (r.phase === "start" || r.phase === "end") return keys === 1 ? { phase: r.phase } : null;
  if (r.phase === "move") return keys === 2 && typeof r.dx === "number" && Number.isFinite(r.dx) && Math.abs(r.dx) <= MAX_ISLAND_OFFSET ? { phase: "move", dx: r.dx } : null;
  return null;
}

/** Whether a screen point is over the island: its rect, offset by the window's position. */
export function overIsland(point: { x: number; y: number }, windowAt: { x: number; y: number }, rect: Rect | null): boolean {
  if (!rect) return false;
  const left = windowAt.x + rect.x;
  const top = windowAt.y + rect.y;
  return point.x >= left && point.x < left + rect.width && point.y >= top && point.y < top + rect.height;
}
