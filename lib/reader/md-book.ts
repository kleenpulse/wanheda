// Markdown and text as a book (T49, V42), pure: how the rendered document is
// cut into pages, which page a place falls on, and the page's shape.
//
// The document is laid out once as a single column at the page's text width
// (the "flow"; y counts down it from 0). A page shows one stretch of it,
// [start, end). Breaks never cut a line: a break that would is moved up to
// the top of that line. A heading never ends a page: it moves to the next one
// with the text it heads. The reader's place (V41, `md:<heading>:<y‰>`) is a
// point in the flow, so the page it falls on follows from it at any size.

/** A top-level block of the flow: a paragraph, list, table, code block or heading. */
export interface FlowBlock {
  top: number;
  bottom: number;
  /** A heading: kept with what follows it, never left at the foot of a page. */
  keep: boolean;
}

/** A line of text (or an image) inside a block: a break never falls inside one. */
export interface LineBox {
  top: number;
  bottom: number;
}

/** One page: the stretch of the flow it shows. */
export interface PageSpan {
  start: number;
  end: number;
}

/** Overlaps under this many px don't count as a line crossing a break (subpixel layout). */
const SLACK = 0.5;

/** The last block whose top is above y, or -1. Blocks are in flow order and don't overlap. */
function blockBefore(blocks: readonly FlowBlock[], y: number): number {
  let lo = 0;
  let hi = blocks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((blocks[mid]?.top ?? Infinity) < y) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Cuts the flow into pages of `height`. `linesOf(i)` gives block i's lines.
 * It is asked once per block, and only for a block a break falls in, so a long
 * document isn't read line by line, and one tall block (a text file with no
 * blank lines is a single paragraph) is read once however many pages it spans
 * (Reviewer FIX: read at every break, it froze for seconds). `total` is the
 * flow's height. Always at least one page.
 */
export function paginate(blocks: readonly FlowBlock[], linesOf: (i: number) => readonly LineBox[], height: number, total: number): PageSpan[] {
  if (!(height > 0) || !(total > 0)) return [{ start: 0, end: Math.max(0, total) }];
  const read = new Map<number, Lines>();
  const lines = (i: number): Lines => {
    let got = read.get(i);
    if (!got) {
      const list = [...linesOf(i)].sort((a, b) => a.top - b.top);
      got = { list, tallest: list.reduce((m, l) => Math.max(m, l.bottom - l.top), 0) };
      read.set(i, got);
    }
    return got;
  };
  const pages: PageSpan[] = [];
  let start = 0;
  // A page always moves on by at least a pixel, so this ends; the cap is a guard against bad input.
  for (let n = 0; n < 200_000; n++) {
    const limit = start + height;
    if (limit >= total - SLACK) {
      pages.push({ start, end: total });
      break;
    }
    const end = breakAt(blocks, lines, start, limit);
    pages.push({ start, end });
    start = nextStart(blocks, end);
    if (start >= total - SLACK) break;
  }
  return pages;
}

/** A block's lines in flow order, and the tallest one's height. */
interface Lines {
  list: readonly LineBox[];
  tallest: number;
}

/**
 * The top of the highest line crossing y, or y when none does. Lines are in
 * flow order, so only those starting less than the tallest line's height
 * above y can cross it: a binary search and a short walk back, not a scan.
 */
function crossing(lines: Lines, y: number): number {
  const { list, tallest } = lines;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid]?.top ?? Infinity) < y - SLACK) lo = mid + 1;
    else hi = mid;
  }
  let top = y;
  for (let k = lo - 1; k >= 0; k--) {
    const l = list[k];
    if (!l || l.top < y - tallest - SLACK) break;
    if (l.bottom > y + SLACK) top = Math.min(top, l.top);
  }
  return top;
}

/** Where a page that starts at `start` and could run to `limit` ends. */
function breakAt(blocks: readonly FlowBlock[], linesOf: (i: number) => Lines, start: number, limit: number): number {
  const i = blockBefore(blocks, limit);
  const b = blocks[i];
  // In the gap after block i (or before the first block).
  if (!b || b.bottom <= limit + SLACK) return keepWithNext(blocks, i, start, limit);
  // Inside a heading: it goes to the next page whole, unless it alone is taller than a page.
  if (b.keep) return b.top > start + SLACK ? b.top : limit;
  // Inside a block: up to the top of the line the limit crosses, again until no line crosses.
  const lines = linesOf(i);
  let cut = limit;
  for (;;) {
    const up = crossing(lines, cut);
    if (up >= cut) break;
    cut = up;
  }
  // Nothing of this page would be left (a line or image taller than a page): cut through it.
  if (cut <= start + SLACK) return limit;
  // The block's first line moved over: the heading just before it goes too.
  return cut <= (lines.list[0]?.top ?? b.top) + SLACK ? keepWithNext(blocks, i - 1, start, cut) : cut;
}

/** A break at `at`, just after block i: if block i is a heading, the break moves up above it. */
function keepWithNext(blocks: readonly FlowBlock[], i: number, start: number, at: number): number {
  const b = blocks[i];
  return b?.keep && b.bottom <= at + SLACK && b.top > start + SLACK ? b.top : at;
}

/** Where the page after a break starts: at the break inside a block, or at the next block's top after a gap. */
function nextStart(blocks: readonly FlowBlock[], end: number): number {
  const i = blockBefore(blocks, end + SLACK);
  const b = blocks[i];
  if (b && b.bottom > end + SLACK) return end;
  const next = blocks[i + 1];
  return next ? Math.max(end, next.top) : Infinity;
}

/** The page (from 1) a point in the flow falls on: the last one starting at or above it. */
export function pageAt(pages: readonly PageSpan[], y: number): number {
  let lo = 0;
  let hi = pages.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((pages[mid]?.start ?? Infinity) <= y + SLACK) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found + 1;
}

/** How far through the book the open pages are, 0–100: where the first starts, or 100 once the last page shows. */
export function bookPercent(open: readonly number[], pages: readonly PageSpan[], total: number): number {
  if (pages.length === 0 || open.includes(pages.length)) return 100;
  const first = pages[(open[0] ?? 1) - 1];
  if (!first || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((first.start / total) * 100)));
}

/** A page's size and margins in px. The text column is `width - 2 * padX` wide and `height - padTop - padBottom` tall. */
export interface PageBox {
  width: number;
  height: number;
  padX: number;
  padTop: number;
  padBottom: number;
}

/** Height / width a text page may take: a book's shape on a wide screen, taller on a phone held upright. */
const ASPECT_MIN = 1.25;
const ASPECT_MAX = 1.62;
const ASPECT_MAX_TALL = 2.1;
/** Room under the text for the page number. */
const FOLIO = 22;

/**
 * The page for a host box (the room page-flip fits the book into): half of
 * it for a spread, all of it for one page, as tall as the room allows within
 * a book's shape. Sized the way page-flip's "stretch" sizes it, so the text
 * laid out at this width is the text page-flip shows.
 */
export function mdPageBox(hostWidth: number, hostHeight: number, single: boolean): PageBox | null {
  if (hostWidth <= 0 || hostHeight <= 0) return null;
  const slot = single ? hostWidth : hostWidth / 2;
  const aspect = Math.min(Math.max(hostHeight / slot, ASPECT_MIN), single ? ASPECT_MAX_TALL : ASPECT_MAX);
  let width = slot;
  let height = width * aspect;
  if (height > hostHeight) {
    height = hostHeight;
    width = height / aspect;
  }
  const padX = Math.round(Math.min(48, Math.max(16, width * 0.085)));
  return { width, height, padX, padTop: padX, padBottom: padX + FOLIO };
}
