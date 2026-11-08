/*
 * Global shortcuts (SPEC V71): quick capture and the palette, which the owner
 * can change in Settings → Desktop, and the media keys, held only while
 * something in Wanheda can play. Pure: main registers what this module allows.
 */

export const SHORTCUT_IDS = ["capture", "palette"] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];

export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutId, string>> = {
  capture: "Ctrl+Shift+Space",
  palette: "Alt+Space",
};

export function isShortcutId(value: unknown): value is ShortcutId {
  return typeof value === "string" && (SHORTCUT_IDS as readonly string[]).includes(value);
}

export type MediaCommand = "play-pause" | "next" | "previous" | "stop";

/** The keyboard's media keys and what each asks the audible owner (V60) to do. */
export const MEDIA_KEYS: Readonly<Record<string, MediaCommand>> = {
  MediaPlayPause: "play-pause",
  MediaNextTrack: "next",
  MediaPreviousTrack: "previous",
  MediaStop: "stop",
};

const MODIFIERS: Readonly<Record<string, "Ctrl" | "Alt" | "Shift" | "Super">> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  commandorcontrol: "Ctrl",
  cmdorctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  super: "Super",
  meta: "Super",
};
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Super"] as const;

const NAMED_KEYS: Readonly<Record<string, string>> = {
  space: "Space",
  tab: "Tab",
  enter: "Enter",
  return: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  plus: "Plus",
};
const PUNCTUATION = new Set([",", ".", "/", ";", "'", "[", "]", "\\", "-", "=", "`"]);

/** Longest accelerator taken: "Ctrl+Alt+Shift+Super+Backspace" is 30. */
export const MAX_ACCELERATOR = 40;

function keyName(token: string): string | null {
  if (/^[a-z0-9]$/i.test(token)) return token.toUpperCase();
  const f = /^f(\d{1,2})$/i.exec(token);
  if (f) {
    const n = Number(f[1]);
    return n >= 1 && n <= 24 ? `F${String(n)}` : null;
  }
  if (PUNCTUATION.has(token)) return token;
  return NAMED_KEYS[token.toLowerCase()] ?? null;
}

/**
 * An accelerator Electron accepts, written one way ("Ctrl+Alt+Shift+Super+Key"),
 * or null. It needs exactly one key and Ctrl, Alt or Super: Shift alone would
 * swallow a capital letter in every other app.
 */
export function parseAccelerator(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ACCELERATOR) return null;
  const tokens = raw.split("+").map((t) => t.trim());
  const mods = new Set<string>();
  let key: string | null = null;
  for (const token of tokens) {
    if (token === "") return null;
    const mod = MODIFIERS[token.toLowerCase()];
    if (mod) {
      if (mods.has(mod)) return null;
      mods.add(mod);
      continue;
    }
    const name = keyName(token);
    if (!name || key !== null) return null;
    key = name;
  }
  if (key === null || !(mods.has("Ctrl") || mods.has("Alt") || mods.has("Super"))) return null;
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** The saved shortcuts: a known accelerator, null when turned off, the default when missing or broken. */
export function parseShortcuts(raw: unknown): Record<ShortcutId, string | null> {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SHORTCUTS } as Record<ShortcutId, string | null>;
  for (const id of SHORTCUT_IDS) {
    const value = record[id];
    if (value === null) out[id] = null;
    else if (value !== undefined) out[id] = parseAccelerator(value) ?? DEFAULT_SHORTCUTS[id];
  }
  return out;
}
