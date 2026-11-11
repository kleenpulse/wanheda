import { TIMER_MODES, type TimerMode } from "@/lib/activity/timer";

// The owner's preferences (FR-SHELL-7): skin, accent colour, the wallpapers
// (which pages, which scene, how far it reaches) and the timer mode. Pure and shared by the server (DB rows, the cookie) and
// the client (the picker, the <head> boot script).
//
// The database is the source of truth for the owner, so prefs follow them to
// another device. A cookie mirrors them so the boot script can paint the right
// skin and accent before React loads, the same way the rail does. Demo mode
// has only the cookie.

/** `default` is the stored name of the Ember & Nebula pair, the first skin. What a new owner gets is `DEFAULT_PREFS.skin`. */
export const SKINS = ["default", "bench"] as const;
export type Skin = (typeof SKINS)[number];

export const WALLPAPERS = ["none", "aurora", "contour", "stars", "dots"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];
/** A wallpaper that draws something: what a per-page entry holds. */
export type Scene = Exclude<Wallpaper, "none">;
export const SCENES = ["aurora", "contour", "stars", "dots"] as const satisfies readonly Scene[];

/** Pages that can wear a wallpaper: the ids of MODULES + SYSTEM_PAGES (a test keeps them in step). */
export const WALLPAPER_PAGES = ["home", "money", "income", "notes", "reader", "media", "settings"] as const;
export type WallpaperPage = (typeof WALLPAPER_PAGES)[number];

/** Where the wallpaper shows: Home only, every page, or a scene chosen per page. */
export const WALLPAPER_SCOPES = ["home", "all", "pages"] as const;
export type WallpaperScope = (typeof WALLPAPER_SCOPES)[number];

/** How far it reaches: the sheet under the top bar, or the whole page behind the header too. */
export const WALLPAPER_COVERS = ["sheet", "page"] as const;
export type WallpaperCover = (typeof WALLPAPER_COVERS)[number];

/** Which screen edge Aurora's light hangs from: the top, or rising from the bottom. */
export const AURORA_EDGES = ["top", "bottom"] as const;
export type AuroraEdge = (typeof AURORA_EDGES)[number];

/** Per-page scenes. A page that isn't listed has none. */
export type WallpaperPages = Partial<Record<WallpaperPage, Scene>>;

export interface Prefs {
  skin: Skin;
  /** The owner's signal colour, `#rrggbb`, or null for the skin's own. */
  accent: string | null;
  /** The one wallpaper for the `home` and `all` scopes. */
  wallpaper: Wallpaper;
  timerMode: TimerMode;
  wallpaperScope: WallpaperScope;
  wallpaperCover: WallpaperCover;
  /** Aurora's edge, wherever Aurora shows. */
  auroraEdge: AuroraEdge;
  /** Used by the `pages` scope. */
  wallpaperPages: WallpaperPages;
}

/** Quick picks beside the free colour input. Data, not styling: the picker shows them as swatches. */
export const ACCENT_PRESETS: readonly { name: string; hex: string }[] = [
  { name: "Coral", hex: "#e8603c" },
  { name: "Gold", hex: "#e6c27a" },
  { name: "Amethyst", hex: "#a855f7" },
  { name: "Cyan", hex: "#22b8cf" },
  { name: "Green", hex: "#2f9e6b" },
  { name: "Rose", hex: "#e64980" },
  { name: "Blue", hex: "#3b82f6" },
];

/** What the colour input shows while the skin's own accent is in use. */
export const PICKER_FALLBACK = "#e8603c";

export const SKIN_LABELS: Record<Skin, string> = { default: "Ember & Nebula", bench: "Bench" };
export const WALLPAPER_LABELS: Record<Wallpaper, string> = {
  none: "None",
  aurora: "Aurora",
  contour: "Contour",
  stars: "Stars",
  dots: "Dots",
};

export const WALLPAPER_SCOPE_LABELS: Record<WallpaperScope, string> = { home: "Home", all: "All pages", pages: "Choose per page" };
export const WALLPAPER_COVER_LABELS: Record<WallpaperCover, string> = { sheet: "Below the top bar", page: "Whole page" };
export const AURORA_EDGE_LABELS: Record<AuroraEdge, string> = { top: "Top", bottom: "Bottom" };

export const TIMER_MODE_LABELS: Record<TimerMode, string> = { single: "One per length", multiple: "Allow repeats" };

/**
 * What an owner with nothing saved gets: Bench with the Gold accent (owner
 * 2026-11-11). It stands in for a missing or bad value only. A saved `default`
 * skin, or a saved null accent ("Skin's own"), is a choice and is kept.
 */
export const DEFAULT_PREFS: Prefs = {
  skin: "bench",
  accent: "#e6c27a",
  wallpaper: "none",
  timerMode: "single",
  wallpaperScope: "home",
  wallpaperCover: "sheet",
  auroraEdge: "top",
  wallpaperPages: {},
};

const HEX = /^#[0-9a-f]{6}$/;

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** `#RRGGBB` or `#rrggbb` → lowercase, anything else → null. Only this shape ever reaches a style. */
export function parseAccent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return HEX.test(v) ? v : null;
}

/** Entry by entry: unknown pages, unknown scenes and `none` are dropped. */
export function parseWallpaperPages(raw: unknown): WallpaperPages {
  const out: WallpaperPages = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const page of WALLPAPER_PAGES) {
    const scene = r[page];
    if (typeof scene === "string" && (SCENES as readonly string[]).includes(scene)) out[page] = scene as Scene;
  }
  return out;
}

/** Field by field: a bad or missing field falls back to its default, the rest survive. A null accent is the skin's own, and survives. */
export function parsePrefs(raw: unknown): Prefs {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    skin: oneOf(SKINS, r.skin, DEFAULT_PREFS.skin),
    accent: r.accent === null ? null : (parseAccent(r.accent) ?? DEFAULT_PREFS.accent),
    wallpaper: oneOf(WALLPAPERS, r.wallpaper, DEFAULT_PREFS.wallpaper),
    timerMode: oneOf(TIMER_MODES, r.timerMode, DEFAULT_PREFS.timerMode),
    wallpaperScope: oneOf(WALLPAPER_SCOPES, r.wallpaperScope, DEFAULT_PREFS.wallpaperScope),
    wallpaperCover: oneOf(WALLPAPER_COVERS, r.wallpaperCover, DEFAULT_PREFS.wallpaperCover),
    auroraEdge: oneOf(AURORA_EDGES, r.auroraEdge, DEFAULT_PREFS.auroraEdge),
    wallpaperPages: parseWallpaperPages(r.wallpaperPages),
  };
}

/** Entry by entry: two maps built apart are never `===`. */
export function samePages(a: WallpaperPages, b: WallpaperPages): boolean {
  return WALLPAPER_PAGES.every((page) => a[page] === b[page]);
}

export function samePrefs(a: Prefs, b: Prefs): boolean {
  return (
    a.skin === b.skin &&
    a.accent === b.accent &&
    a.wallpaper === b.wallpaper &&
    a.timerMode === b.timerMode &&
    a.wallpaperScope === b.wallpaperScope &&
    a.wallpaperCover === b.wallpaperCover &&
    a.auroraEdge === b.auroraEdge &&
    samePages(a.wallpaperPages, b.wallpaperPages)
  );
}

// Wallpapers (SPEC V64) ---------------------------------------------------

type WallpaperChoice = Pick<Prefs, "wallpaper" | "wallpaperScope" | "wallpaperPages">;

/** The scene a page wears. Everything that draws or ticks a wallpaper asks this. */
export function wallpaperFor(p: WallpaperChoice, page: WallpaperPage | null): Wallpaper {
  if (!page) return "none";
  if (p.wallpaperScope === "pages") return p.wallpaperPages[page] ?? "none";
  if (p.wallpaperScope === "all") return p.wallpaper;
  return page === "home" ? p.wallpaper : "none";
}

/** The map with one page's scene set, or removed for none. A new object: prefs are state. */
export function withPageWallpaper(pages: WallpaperPages, page: WallpaperPage, wallpaper: Wallpaper): WallpaperPages {
  const out: WallpaperPages = {};
  for (const p of WALLPAPER_PAGES) {
    const scene = p === page ? wallpaper : pages[p];
    if (scene && scene !== "none") out[p] = scene;
  }
  return out;
}

/**
 * The per-page map to use when switching to `pages`. An empty map is seeded
 * from what shows now, so nothing disappears at the switch; a map the owner
 * already filled is kept, so pages → all → pages keeps their picks.
 */
export function seedPages(p: WallpaperChoice): WallpaperPages {
  if (WALLPAPER_PAGES.some((page) => p.wallpaperPages[page])) return p.wallpaperPages;
  const out: WallpaperPages = {};
  if (p.wallpaper === "none") return out;
  for (const page of WALLPAPER_PAGES) {
    if (p.wallpaperScope === "all" || page === "home") out[page] = p.wallpaper;
  }
  return out;
}

// Cookie ------------------------------------------------------------------

export const PREFS_COOKIE = "wanheda-prefs";

/** `home-aurora_money-stars`, or `-` for none: page ids and scene names never hold `-`, `_` or `.`. */
function encodePages(pages: WallpaperPages): string {
  const pairs = WALLPAPER_PAGES.flatMap((page) => {
    const scene = pages[page];
    return scene ? [`${page}-${scene}`] : [];
  });
  return pairs.length ? pairs.join("_") : "-";
}

function decodePages(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (value ?? "").split("_")) {
    const [page, scene] = pair.split("-");
    if (page && scene) out[page] = scene;
  }
  return out;
}

/**
 * `skin.accent.wallpaper.timerMode.scope.cover.pages.auroraEdge`, accent without `#` or
 * `-`: cookie-safe, no encoding. The boot script reads only the first two, and
 * a cookie from before the wallpaper fields decodes them to their defaults.
 * `-` is the skin's own accent, chosen; a missing accent is the default one.
 */
export function encodePrefs(p: Prefs): string {
  return [p.skin, p.accent ? p.accent.slice(1) : "-", p.wallpaper, p.timerMode, p.wallpaperScope, p.wallpaperCover, encodePages(p.wallpaperPages), p.auroraEdge].join(".");
}

export function decodePrefs(value: string | undefined | null): Prefs {
  const [skin, accent, wallpaper, timerMode, wallpaperScope, wallpaperCover, pages, auroraEdge] = (value ?? "").split(".");
  return parsePrefs({
    skin,
    accent: accent === "-" ? null : accent ? `#${accent}` : undefined,
    wallpaper,
    timerMode,
    wallpaperScope,
    wallpaperCover,
    wallpaperPages: decodePages(pages),
    auroraEdge,
  });
}

/** A year, whole site, never sent cross-site. Written by the client after a change or a load. */
export function prefsCookie(p: Prefs): string {
  return `${PREFS_COOKIE}=${encodePrefs(p)}; path=/; max-age=31536000; samesite=lax`;
}

// Document ----------------------------------------------------------------

export const SKIN_ATTR = "data-skin";
export const ACCENT_ATTR = "data-accent";
/** The picked colour; globals.css derives the signal family from it per theme. */
export const ACCENT_VAR = "--accent-user";

/** Puts the skin and accent on <html>. The boot script does the same from the cookie. */
export function applyPrefs(el: HTMLElement, p: Pick<Prefs, "skin" | "accent">): void {
  if (p.skin === "default") el.removeAttribute(SKIN_ATTR);
  else el.setAttribute(SKIN_ATTR, p.skin);
  if (p.accent) {
    el.style.setProperty(ACCENT_VAR, p.accent);
    el.setAttribute(ACCENT_ATTR, "");
  } else {
    el.style.removeProperty(ACCENT_VAR);
    el.removeAttribute(ACCENT_ATTR);
  }
}

/**
 * An inline <head> script: skin and accent before first paint, from the
 * cookie, and the defaults for what it lacks (no cookie yet, or a bad field),
 * the way `decodePrefs` reads it (an accent in capitals included). It
 * validates both itself (a fixed skin list, six hex digits), so a tampered
 * cookie can't inject anything into the page's style.
 */
export function prefsBootScript(): string {
  const skins = JSON.stringify(SKINS);
  const skin = JSON.stringify(DEFAULT_PREFS.skin);
  const accent = JSON.stringify(DEFAULT_PREFS.accent?.slice(1) ?? "");
  return `try{var d=document.documentElement,m=/(?:^|;\\s*)${PREFS_COOKIE}=([^;]*)/.exec(document.cookie),p=m?m[1].split("."):[],s=${skins}.indexOf(p[0])>=0?p[0]:${skin},q=(p[1]||"").toLowerCase(),a=/^[0-9a-f]{6}$/.test(q)?q:q==="-"?"":${accent};if(s!=="default")d.setAttribute("${SKIN_ATTR}",s);if(a){d.style.setProperty("${ACCENT_VAR}","#"+a);d.setAttribute("${ACCENT_ATTR}","")}}catch(e){}`;
}
