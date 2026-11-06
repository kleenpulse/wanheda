"use client";

import { createDevicePref, type DevicePref } from "@/hooks/device-pref";
import {
  parseAutoSpeed,
  parseBookPages,
  parseCoverFit,
  parseCoverStyle,
  parsePageTurn,
  parsePaper,
  parseTextSize,
  type BookPages,
  type CoverFit,
  type CoverStyle,
  type PageTurn,
  type Paper,
  type ReaderPrefs,
} from "@/lib/reader/prefs";

// The reader's settings (user 2026-11-06): Settings → Reader and the reader's
// own bars set the same ones. Read from this device at once, so a change shows
// everywhere without waiting, and kept in the owner's account too
// (reader-prefs-sync.tsx), so they follow to another device. Values are
// checked by lib/reader/prefs.ts, shared with the server. A light module: the
// shell imports it for the sync, so it must not pull in the reader's UI.

export { TEXT_SIZES, TEXT_SIZE_LABELS, type BookPages, type CoverFit, type CoverStyle, type PageTurn, type Paper } from "@/lib/reader/prefs";

// ── Library covers ───────────────────────────────────────────────────────

export const coverStylePref = createDevicePref<CoverStyle>(
  "wanheda-reader-cover",
  (raw) => parseCoverStyle(raw) ?? "page",
  (v) => (v === "page" ? null : v),
);

export const coverFitPref = createDevicePref<CoverFit>(
  "wanheda-reader-cover-fit",
  (raw) => parseCoverFit(raw) ?? "fill",
  (v) => (v === "fill" ? null : v),
);

// ── Reading ──────────────────────────────────────────────────────────────

/** Spread or one page on a wide screen, for every book, PDF or text (small print reads better one page at a time). */
export const bookPagesPref = createDevicePref<BookPages>(
  "wanheda-reader-book-pages",
  (raw) => parseBookPages(raw) ?? "spread",
  (v) => v,
);

export const pageTurnPref = createDevicePref<PageTurn>(
  "wanheda-reader-turn",
  (raw) => parsePageTurn(raw) ?? "curl",
  (v) => (v === "curl" ? null : v),
);

export const textSizePref = createDevicePref<number>(
  "wanheda-reader-text-size",
  (raw) => parseTextSize(raw) ?? 1,
  (v) => (v === 1 ? null : String(v)),
);

/** The page's paper in every document (paper.tsx draws it). */
export const paperPref = createDevicePref<Paper>(
  "wanheda-reader-paper",
  (raw) => parsePaper(raw) ?? "plain",
  (v) => (v === "plain" ? null : v),
);

/** The auto-scroll slider's position, 0–100; chrome.tsx turns it into px a second on a curve. */
export const autoSpeedPref = createDevicePref<number>(
  "wanheda-reader-autoscroll",
  (raw) => parseAutoSpeed(raw) ?? 50,
  (v) => String(v),
);

/** Every reader pref by its field in `ReaderPrefs`, for the account sync. */
export const READER_DEVICE_PREFS: { [K in keyof ReaderPrefs]: DevicePref<ReaderPrefs[K]> } = {
  coverStyle: coverStylePref,
  coverFit: coverFitPref,
  bookPages: bookPagesPref,
  pageTurn: pageTurnPref,
  textSize: textSizePref,
  paper: paperPref,
  autoSpeed: autoSpeedPref,
};
