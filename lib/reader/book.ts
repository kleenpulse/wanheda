// The PDF book (SPEC V42), pure: how pages pair into spreads, which pages the
// page-flip window holds, what the page field says and reads, the percent a
// place is worth, and find's highlighting. The viewer components build on it.
//
// Pages are numbered from 1. A spread is what's open at once: on a wide
// screen page 1 alone as the cover, then 2-3, 4-5, …; on a narrow one, one
// page. A trailing even page stands alone on the left.

export interface BookLayout {
  pages: number;
  /** One page at a time (narrow screen or portrait phone). */
  single: boolean;
}

/** How many spreads the book has. */
export function spreadCount({ pages, single }: BookLayout): number {
  if (pages <= 0) return 0;
  return single ? pages : 1 + Math.ceil((pages - 1) / 2);
}

/** The spread a page sits in. */
export function spreadOf(page: number, layout: BookLayout): number {
  const p = clampPage(page, layout.pages);
  if (layout.single) return p - 1;
  return p === 1 ? 0 : Math.floor(p / 2);
}

/** The pages of a spread, left to right. */
export function spreadPages(spread: number, layout: BookLayout): number[] {
  const last = spreadCount(layout) - 1;
  const s = Math.min(Math.max(0, spread), Math.max(0, last));
  if (layout.pages <= 0) return [];
  if (layout.single) return [s + 1];
  if (s === 0) return [1];
  const left = 2 * s;
  return left + 1 <= layout.pages ? [left, left + 1] : [left];
}

export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, pages));
}

/** A blank, see-through page: the left of the cover spread, or the right of a lone last page. */
export const PHANTOM = 0;

export interface BookWindow {
  /** First and last spread held. */
  from: number;
  to: number;
  /**
   * What page-flip is given, in order: page numbers, PHANTOM for a blank.
   * On a wide screen it always pairs from an even index, so page-flip's own
   * pairing (showCover off) matches the book's, and no page is ever a lone
   * "hard" page.
   */
  items: number[];
}

/** Spreads held either side of the open one. Small: page-flip touches every page it holds on each frame. */
export const WINDOW_REACH = 2;

/** The window of pages page-flip holds around a spread. */
export function bookWindow(spread: number, layout: BookLayout, reach = WINDOW_REACH): BookWindow {
  const count = spreadCount(layout);
  if (count === 0) return { from: 0, to: 0, items: [] };
  const s = Math.min(Math.max(0, spread), count - 1);
  const from = Math.max(0, s - reach);
  const to = Math.min(count - 1, s + reach);
  const items: number[] = [];
  if (!layout.single && from === 0) items.push(PHANTOM);
  for (let i = from; i <= to; i++) items.push(...spreadPages(i, layout));
  if (!layout.single && items.length % 2 === 1) items.push(PHANTOM);
  return { from, to, items };
}

/** page-flip's index for a page in a window; -1 when it isn't held. */
export function windowIndex(win: BookWindow, page: number): number {
  return page === PHANTOM ? -1 : win.items.indexOf(page);
}

/** The spread page-flip shows at an index of a window. */
export function spreadAtIndex(win: BookWindow, index: number, layout: BookLayout): number {
  const own = win.items[index];
  if (own !== undefined && own !== PHANTOM) return spreadOf(own, layout);
  // A phantom: the real page beside it.
  const beside = win.items[index % 2 === 0 ? index + 1 : index - 1];
  return beside !== undefined && beside !== PHANTOM ? spreadOf(beside, layout) : win.from;
}

/**
 * Whether the window must be rebuilt around a spread: it's outside the
 * window, or at an edge with more book beyond, so the next turn that way
 * would have nothing to curl onto.
 */
export function needsRebuild(win: BookWindow, spread: number, layout: BookLayout): boolean {
  const last = spreadCount(layout) - 1;
  if (spread < win.from || spread > win.to) return true;
  return (spread === win.from && spread > 0) || (spread === win.to && spread < last);
}

/** Pages to render as images: the open spread and one either side (V42, V43). */
export function pagesToRender(spread: number, layout: BookLayout, reach = 1): number[] {
  const count = spreadCount(layout);
  const out: number[] = [];
  for (let s = Math.max(0, spread - reach); s <= Math.min(count - 1, spread + reach); s++) out.push(...spreadPages(s, layout));
  return out;
}

// ── Page field ───────────────────────────────────────────────────────────

/** What the page field shows for a spread: `4-5` or `1`. */
export function pageFieldText(spread: number, layout: BookLayout): string {
  const pages = spreadPages(spread, layout);
  const [a, b] = pages;
  if (a === undefined) return "";
  return b === undefined ? String(a) : `${String(a)}-${String(b)}`;
}

/**
 * What the page field lets through as it's typed (user 2026-11-06: no
 * letters): digits, and one hyphen after them for a spread's `a-b`. Anything
 * else is dropped as it lands, so the field never holds a non-number.
 */
export function cleanPageField(raw: string): string {
  // Nothing past a slash: a pasted "12 / 300" is page 12, not 12300.
  const kept = (raw.split("/")[0] ?? "").replace(/[^\d-]/g, "").replace(/^-+/, "");
  const dash = kept.indexOf("-");
  const tidy = dash === -1 ? kept : kept.slice(0, dash + 1) + kept.slice(dash + 1).replace(/-/g, "");
  return tidy.slice(0, 15);
}

/** Reads what the owner typed into the page field: `12`, `12-13`, `12 / 300`. Null when it isn't a page. */
export function parsePageField(raw: string, pages: number): number | null {
  // A trailing hyphen ("142-") is what's left when the second number is deleted: it still means 142.
  const m = /^\s*(\d{1,7})\s*(?:[-–]\s*(?:\d{1,7})?\s*)?(?:\/\s*\d*\s*)?$/.exec(raw);
  if (!m || pages <= 0) return null;
  return clampPage(Number(m[1]), pages);
}

// ── Progress (V41) ───────────────────────────────────────────────────────

/** How far through a PDF a place is, 0–100. `y` is ‰ down the page. */
export function pdfPercent(page: number, y: number, pages: number): number {
  if (pages <= 0) return 0;
  const p = clampPage(page, pages);
  const into = Math.min(1000, Math.max(0, y)) / 1000;
  return Math.min(100, Math.max(0, Math.round(((p - 1 + into) / pages) * 100)));
}

/** The percent for an open spread: its first page, or 100 once the last page is showing. */
export function spreadPercent(spread: number, layout: BookLayout): number {
  const pages = spreadPages(spread, layout);
  if (pages.includes(layout.pages)) return 100;
  return pdfPercent(pages[0] ?? 1, 0, layout.pages);
}

// ── Rendering ────────────────────────────────────────────────────────────

/** Most pixels one page image may hold (≈ 4K): keeps a deep zoom on a big page from eating memory. */
export const MAX_PAGE_PIXELS = 8_300_000;

/**
 * The scale to render a page at so it's sharp at `cssWidth` CSS pixels on
 * this screen, held under MAX_PAGE_PIXELS. `pageWidth`/`pageHeight` are the
 * page's size at scale 1.
 */
export function renderScale(pageWidth: number, pageHeight: number, cssWidth: number, dpr: number): number {
  if (pageWidth <= 0 || pageHeight <= 0 || cssWidth <= 0) return 1;
  const want = (cssWidth * Math.min(Math.max(1, dpr), 3)) / pageWidth;
  const cap = Math.sqrt(MAX_PAGE_PIXELS / (pageWidth * pageHeight));
  return Math.max(0.1, Math.min(want, cap));
}

export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3] as const;

export function nextZoom(zoom: number, dir: 1 | -1): number {
  const i = ZOOM_STEPS.findIndex((z) => z >= zoom - 1e-6);
  const at = i === -1 ? ZOOM_STEPS.length - 1 : i;
  const exact = ZOOM_STEPS[at] !== undefined && Math.abs((ZOOM_STEPS[at] ?? 0) - zoom) < 1e-6;
  const to = dir === 1 ? (exact ? at + 1 : at) : at - 1;
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, to))] ?? 1;
}

// ── Find ─────────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Normalises a query the way find compares: trimmed, inner runs of space collapsed, lower case. */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether text holds a (normalised) query. */
export function textHas(text: string, query: string): boolean {
  if (!query) return false;
  return text.replace(/\s+/g, " ").toLowerCase().includes(query);
}

/**
 * A (normalised) query as a pattern over the original text: case-insensitive
 * with Unicode folding, any run of whitespace between its words. Matching
 * the original, not a lower-cased copy, keeps every offset right even where
 * lower-casing changes a string's length (İ). Null for an empty query.
 */
export function queryPattern(query: string): RegExp | null {
  const words = query.split(" ").filter(Boolean);
  if (words.length === 0) return null;
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "giu");
}

/**
 * A text-layer run as HTML with every match wrapped in <mark>. The PDF's text
 * is hostile (V40): every piece is escaped, matched or not, so no character
 * of it is ever read as markup.
 */
export function highlightRun(str: string, query: string): string {
  const re = queryPattern(query);
  if (!re) return escapeHtml(str);
  let out = "";
  let from = 0;
  for (const m of str.matchAll(re)) {
    out += escapeHtml(str.slice(from, m.index)) + "<mark>" + escapeHtml(m[0]) + "</mark>";
    from = m.index + m[0].length;
  }
  return out + escapeHtml(str.slice(from));
}

// ── Auto-scroll ──────────────────────────────────────────────────────────

/** Fastest auto-scroll, px a second, at the top of the slider. */
export const AUTO_SCROLL_MAX = 200;

/**
 * The slider's position (0–100) as a speed in px a second, on a square curve:
 * the low end creeps (20 ⇒ 8 px/s, near still; user 2026-11-06), the middle
 * reads at 50, the top is 200. Never fully stopped: that's the off switch.
 */
export function autoScrollSpeed(position: number): number {
  const p = Math.min(100, Math.max(0, Number.isFinite(position) ? position : 0)) / 100;
  return Math.max(1, AUTO_SCROLL_MAX * p * p);
}
