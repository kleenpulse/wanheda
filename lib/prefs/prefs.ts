import { TIMER_MODES, type TimerMode } from "@/lib/activity/timer";

// The owner's preferences (FR-SHELL-7): skin, accent colour, home wallpaper
// and the timer mode. Pure and shared by the server (DB rows, the cookie) and
// the client (the picker, the <head> boot script).
//
// The database is the source of truth for the owner, so prefs follow them to
// another device. A cookie mirrors them so the boot script can paint the right
// skin and accent before React loads, the same way the rail does. Demo mode
// has only the cookie.

export const SKINS = ["default", "bench"] as const;
export type Skin = (typeof SKINS)[number];

export const WALLPAPERS = ["none", "aurora", "contour", "stars", "dots"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

export interface Prefs {
  skin: Skin;
  /** The owner's signal colour, `#rrggbb`, or null for the skin's own. */
  accent: string | null;
  wallpaper: Wallpaper;
  timerMode: TimerMode;
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

export const TIMER_MODE_LABELS: Record<TimerMode, string> = { single: "One per length", multiple: "Allow repeats" };

export const DEFAULT_PREFS: Prefs = { skin: "default", accent: null, wallpaper: "none", timerMode: "single" };

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

/** Field by field: a bad or missing field falls back to its default, the rest survive. */
export function parsePrefs(raw: unknown): Prefs {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    skin: oneOf(SKINS, r.skin, DEFAULT_PREFS.skin),
    accent: parseAccent(r.accent),
    wallpaper: oneOf(WALLPAPERS, r.wallpaper, DEFAULT_PREFS.wallpaper),
    timerMode: oneOf(TIMER_MODES, r.timerMode, DEFAULT_PREFS.timerMode),
  };
}

export function samePrefs(a: Prefs, b: Prefs): boolean {
  return a.skin === b.skin && a.accent === b.accent && a.wallpaper === b.wallpaper && a.timerMode === b.timerMode;
}

// Cookie ------------------------------------------------------------------

export const PREFS_COOKIE = "wanheda-prefs";

/** `skin.accent.wallpaper.timerMode`, accent without `#` or `-`: cookie-safe, no encoding. */
export function encodePrefs(p: Prefs): string {
  return [p.skin, p.accent ? p.accent.slice(1) : "-", p.wallpaper, p.timerMode].join(".");
}

export function decodePrefs(value: string | undefined | null): Prefs {
  const [skin, accent, wallpaper, timerMode] = (value ?? "").split(".");
  return parsePrefs({ skin, accent: accent && accent !== "-" ? `#${accent}` : null, wallpaper, timerMode });
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
 * An inline <head> script: skin and accent from the cookie before first
 * paint. It validates both itself (a fixed skin list, six hex digits), so a
 * tampered cookie can't inject anything into the page's style.
 */
export function prefsBootScript(): string {
  const skins = JSON.stringify(SKINS.filter((s) => s !== "default"));
  return `try{var m=/(?:^|;\\s*)${PREFS_COOKIE}=([^;]*)/.exec(document.cookie);if(m){var p=m[1].split("."),d=document.documentElement;if(${skins}.indexOf(p[0])>=0)d.setAttribute("${SKIN_ATTR}",p[0]);if(/^[0-9a-f]{6}$/.test(p[1]||"")){d.style.setProperty("${ACCENT_VAR}","#"+p[1]);d.setAttribute("${ACCENT_ATTR}","")}}}catch(e){}`;
}
