// The reader's preferences (Settings → Reader, user 2026-11-06). Pure, so the
// client's device prefs (localStorage, read at once) and the server's
// `user_prefs.reader` column (the owner's, carried to every device) check
// values the same way. A bad or missing field falls back on its own; the rest
// survive.

export const COVER_STYLES = ["page", "title"] as const;
/** What a PDF's cover shows: its page one, or the title card every document has until then. */
export type CoverStyle = (typeof COVER_STYLES)[number];

export const COVER_FITS = ["fill", "whole"] as const;
/** How page one sits in the cover: filling it (cropped, top kept) or whole (nothing cut). */
export type CoverFit = (typeof COVER_FITS)[number];

export const BOOK_PAGES = ["spread", "single"] as const;
/** Spread or one page on a wide screen. */
export type BookPages = (typeof BOOK_PAGES)[number];

export const PAGE_TURNS = ["curl", "instant"] as const;
/** How a book's page turns: a curl, or at once. Reduced motion always turns at once. */
export type PageTurn = (typeof PAGE_TURNS)[number];

/** Text size for Markdown and text: the sheet's (and the book's) type scale. */
export const TEXT_SIZES: readonly number[] = [0.875, 1, 1.125, 1.25, 1.5];
export const TEXT_SIZE_LABELS: readonly string[] = ["Small", "Default", "Large", "Larger", "Largest"];

export const PAPER_TONES = ["plain", "amber", "rose", "sky", "mint", "violet"] as const;
export type PaperTone = (typeof PAPER_TONES)[number];
export const PAPERS = [
  ...PAPER_TONES,
  "night-plain",
  "night-amber",
  "night-rose",
  "night-sky",
  "night-mint",
  "night-violet",
] as const satisfies readonly (PaperTone | `night-${PaperTone}`)[];
/** The page's paper: a light tone, or a dark one (`night-`). */
export type Paper = (typeof PAPERS)[number];

export interface ReaderPrefs {
  coverStyle: CoverStyle;
  coverFit: CoverFit;
  bookPages: BookPages;
  pageTurn: PageTurn;
  textSize: number;
  paper: Paper;
  /** The auto-scroll slider's position, 0–100 (chrome.tsx turns it into px a second). */
  autoSpeed: number;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  coverStyle: "page",
  coverFit: "fill",
  bookPages: "spread",
  pageTurn: "curl",
  textSize: 1,
  paper: "plain",
  autoSpeed: 50,
};

export const READER_PREF_KEYS = Object.keys(DEFAULT_READER_PREFS) as (keyof ReaderPrefs)[];

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
}

export const parseCoverStyle = (v: unknown): CoverStyle | null => oneOf(COVER_STYLES, v);
export const parseCoverFit = (v: unknown): CoverFit | null => oneOf(COVER_FITS, v);
export const parseBookPages = (v: unknown): BookPages | null => oneOf(BOOK_PAGES, v);
export const parsePageTurn = (v: unknown): PageTurn | null => oneOf(PAGE_TURNS, v);
export const parsePaper = (v: unknown): Paper | null => oneOf(PAPERS, v);

/** One of the fixed sizes; a number or the string localStorage keeps. */
export function parseTextSize(v: unknown): number | null {
  const n = typeof v === "string" && v !== "" ? Number(v) : v;
  return typeof n === "number" && TEXT_SIZES.includes(n) ? n : null;
}

/** 0–100, rounded and clamped; a number or the string localStorage keeps. */
export function parseAutoSpeed(v: unknown): number | null {
  const n = typeof v === "string" && v !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

const PARSERS: { [K in keyof ReaderPrefs]: (v: unknown) => ReaderPrefs[K] | null } = {
  coverStyle: parseCoverStyle,
  coverFit: parseCoverFit,
  bookPages: parseBookPages,
  pageTurn: parsePageTurn,
  textSize: parseTextSize,
  paper: parsePaper,
  autoSpeed: parseAutoSpeed,
};

/** Only the fields that are there and valid: a missing one means "not saved yet", not "the default". */
export function parseReaderPrefs(raw: unknown): Partial<ReaderPrefs> {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Record<keyof ReaderPrefs, unknown>> = {};
  for (const key of READER_PREF_KEYS) {
    const value = PARSERS[key](r[key]);
    if (value !== null) out[key] = value;
  }
  return out as Partial<ReaderPrefs>;
}

/** Every field present and valid, or null. What the server accepts and stores. */
export function completeReaderPrefs(raw: unknown): ReaderPrefs | null {
  if (typeof raw !== "object" || raw === null) return null;
  const keys = Object.keys(raw);
  if (keys.length !== READER_PREF_KEYS.length || !keys.every((k) => (READER_PREF_KEYS as string[]).includes(k))) return null;
  const parsed = parseReaderPrefs(raw);
  return READER_PREF_KEYS.every((k) => parsed[k] !== undefined) ? (parsed as ReaderPrefs) : null;
}

export function sameReaderPrefs(a: ReaderPrefs, b: ReaderPrefs): boolean {
  return READER_PREF_KEYS.every((k) => a[k] === b[k]);
}
