"use client";

import { createDevicePref } from "@/hooks/device-pref";

// The reader's settings that Settings → Reader tunes (user 2026-11-06), kept on
// this device like every reader preference. The book's spread / one page
// (`bookPagesPref`, chrome.tsx), auto-scroll speed (`autoSpeedPref`,
// chrome.tsx) and the paper (`paperPref`, paper.tsx) live beside the controls
// that set them in the reader; these are the rest.

// ── Library covers ───────────────────────────────────────────────────────

/** What a PDF's cover shows: its page one, or the title card every document has until then. */
export type CoverStyle = "page" | "title";
export const coverStylePref = createDevicePref<CoverStyle>(
  "wanheda-reader-cover",
  (raw) => (raw === "title" ? "title" : "page"),
  (v) => (v === "page" ? null : v),
);

/** How page one sits in the cover: filling it (cropped, top kept) or whole (nothing cut). */
export type CoverFit = "fill" | "whole";
export const coverFitPref = createDevicePref<CoverFit>(
  "wanheda-reader-cover-fit",
  (raw) => (raw === "whole" ? "whole" : "fill"),
  (v) => (v === "fill" ? null : v),
);

// ── Reading ──────────────────────────────────────────────────────────────

/** How a book's page turns: a curl, or at once. Reduced motion always turns at once. */
export type PageTurn = "curl" | "instant";
export const pageTurnPref = createDevicePref<PageTurn>(
  "wanheda-reader-turn",
  (raw) => (raw === "instant" ? "instant" : "curl"),
  (v) => (v === "curl" ? null : v),
);

/** Text size for Markdown and text: the sheet's (and the book's) type scale. */
export const TEXT_SIZES: readonly number[] = [0.875, 1, 1.125, 1.25, 1.5];
export const TEXT_SIZE_LABELS: readonly string[] = ["Small", "Default", "Large", "Larger", "Largest"];
export const textSizePref = createDevicePref<number>(
  "wanheda-reader-text-size",
  (raw) => {
    const n = Number(raw);
    return raw !== null && TEXT_SIZES.includes(n) ? n : 1;
  },
  (v) => (v === 1 ? null : String(v)),
);
