// Read-along (T56, V48), the pure parts: where "play from here" starts, how
// a spoken sentence from text.json (V44) is found again in what the reader
// shows, and the place the voice saves. Client-safe, no DOM.
//
// Sentences were cut from text with control characters dropped and
// whitespace collapsed (extract.ts, cleanText). The reader's own text (a PDF
// page's runs, the Markdown DOM) is normalised the same way here, keeping
// where each character came from, so a sentence found in it maps back to the
// runs or text nodes that show it.

import { placeAt, type MdPlace, type Section } from "./md";
import { formatLocator, parseLocator } from "./reader";
import type { Sentence } from "./extract";
import type { SpeechStatus } from "../speech/store";

// ── Normalised text ──────────────────────────────────────────────────────

const WS = /\s/;
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F]/;

/** Text normalised like extract.ts's cleanText, with where each character came from: a piece (run, text node) and an offset in it. */
export interface NormText {
  text: string;
  piece: Int32Array;
  off: Int32Array;
}

/**
 * Builds a NormText piece by piece. Whitespace collapses to one space (none at
 * the start, none after a break), control characters go, and `brk` marks a
 * block boundary with a newline, which no sentence ever holds: a sentence
 * never runs from one block into the next.
 */
export class NormBuilder {
  #chars: string[] = [];
  #piece: number[] = [];
  #off: number[] = [];

  #last(): string | undefined {
    return this.#chars[this.#chars.length - 1];
  }

  #push(c: string, piece: number, off: number): void {
    this.#chars.push(c);
    this.#piece.push(piece);
    this.#off.push(off);
  }

  add(piece: number, str: string): void {
    for (let j = 0; j < str.length; j++) {
      const c = str.charAt(j);
      if (CONTROL.test(c)) continue;
      if (WS.test(c)) this.space(piece, j);
      else this.#push(c, piece, j);
    }
  }

  /** A space between pieces that don't run on (a line end, a `<br>`). */
  space(piece: number, off: number): void {
    const last = this.#last();
    if (last !== undefined && last !== " " && last !== "\n") this.#push(" ", piece, off);
  }

  /** A block boundary. */
  brk(): void {
    const last = this.#last();
    if (last === undefined || last === "\n") return;
    if (last === " ") this.#chars[this.#chars.length - 1] = "\n";
    else this.#push("\n", this.#piece[this.#piece.length - 1] ?? 0, (this.#off[this.#off.length - 1] ?? 0) + 1);
  }

  done(): NormText {
    return { text: this.#chars.join(""), piece: Int32Array.from(this.#piece), off: Int32Array.from(this.#off) };
  }
}

/** A PDF page's text runs as the extractor joined them (SentenceStream: back to back, a space at each line end). Pieces are run indexes. */
export function pageText(runs: readonly { str: string; hasEOL: boolean }[]): NormText {
  const b = new NormBuilder();
  runs.forEach((r, i) => {
    b.add(i, r.str);
    if (r.hasEOL) b.space(i, r.str.length);
  });
  return b.done();
}

// ── Finding a sentence ───────────────────────────────────────────────────

export interface Hit {
  /** The sentence's span in the text. */
  start: number;
  end: number;
  /** What's left of the sentence past the end of the text: it runs on over a page break. "" when all of it is here. */
  rest: string;
}

/** Look at this many characters of a sentence to find where it might start. */
const PROBE = 48;
/** Never weigh more than this many places for one sentence ("Yes." may be everywhere). */
const MAX_HITS = 64;

function common(text: string, at: number, s: string): number {
  let n = 0;
  while (n < s.length && at + n < text.length && text.charCodeAt(at + n) === s.charCodeAt(n)) n++;
  return n;
}

/**
 * Every place a sentence is in the text, in order. With `runOn` (a PDF page),
 * a sentence may also start near the end and run on to the next page: then
 * only its first part is here, and `rest` holds the remainder.
 */
export function sentenceHits(text: string, sentence: string, runOn: boolean): Hit[] {
  if (!sentence) return [];
  const hits: Hit[] = [];
  const end = text.trimEnd().length;
  const take = (start: number): void => {
    const n = common(text, start, sentence);
    if (n === sentence.length) hits.push({ start, end: start + n, rest: "" });
    else if (runOn && start + n >= end && n > 0) hits.push({ start, end: start + n, rest: sentence.slice(n).trim() });
  };
  const probe = sentence.slice(0, PROBE);
  for (let at = text.indexOf(probe); at >= 0 && hits.length < MAX_HITS; at = text.indexOf(probe, at + 1)) take(at);
  if (!runOn || hits.some((h) => h.rest !== "")) return hits;
  // Shorter than the probe on this page: the page's last characters are the sentence's first ones.
  for (let at = Math.max(0, end - Math.min(sentence.length, PROBE) + 1); at < end; at++) {
    if (at > 0 && text.charAt(at - 1) !== " " && text.charAt(at - 1) !== "\n") continue;
    if (sentence.startsWith(text.slice(at, end))) {
      hits.push({ start: at, end, rest: sentence.slice(end - at).trim() });
      break;
    }
  }
  return hits;
}

/** The rest of a sentence that ran on from the page before: it opens this page's text. */
export function continuedHit(text: string, rest: string): Hit | null {
  const at = text.search(/\S/);
  if (at < 0 || !rest) return null;
  const n = common(text, at, rest);
  return n > 0 ? { start: at, end: at + n, rest: rest.slice(n).trim() } : null;
}

/** A span of the text as the pieces it covers: [piece, from, to) in each piece's own offsets, in order. */
export function spanPieces(norm: NormText, start: number, end: number): { piece: number; from: number; to: number }[] {
  const out: { piece: number; from: number; to: number }[] = [];
  for (let k = Math.max(0, start); k < Math.min(end, norm.text.length); k++) {
    // A collapsed space or a break stands for no character of its own.
    const c = norm.text.charAt(k);
    if (c === " " || c === "\n") continue;
    const piece = norm.piece[k] ?? 0;
    const off = norm.off[k] ?? 0;
    const last = out[out.length - 1];
    if (last?.piece === piece) last.to = Math.max(last.to, off + 1);
    else out.push({ piece, from: off, to: off + 1 });
  }
  return out;
}

/** The hit nearest a wanted position (by `distance`), the first on a tie. */
export function nearest<T>(hits: readonly T[], distance: (h: T) => number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const h of hits) {
    const d = distance(h);
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

// ── PDF ──────────────────────────────────────────────────────────────────

/** A pdf locator's page and y‰, or null. */
export function pdfAt(locator: string): { page: number; y: number } | null {
  const l = parseLocator(locator);
  return l?.kind === "pdf" ? { page: l.page, y: l.y } : null;
}

/** A line already partly scrolled past still counts as shown, by this much (‰ of a page). */
const PDF_SLACK = 8;

/**
 * "Play from here" in a PDF (V48): the first sentence that starts at or
 * after the shown place, on its page or a later one. Sentences come in page
 * order; within a page, in reading order, which in columns isn't top to
 * bottom, so the page is read from its first sentence at or below the place.
 * Past the last sentence: the last one.
 */
export function firstPdfSentence(sentences: readonly Pick<Sentence, "locator">[], place: { page: number; y: number }): number {
  let lo = 0;
  let hi = sentences.length;
  // The first sentence on the place's page or after it.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = pdfAt(sentences[mid]?.locator ?? "");
    if ((at?.page ?? 0) < place.page) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < sentences.length; i++) {
    const at = pdfAt(sentences[i]?.locator ?? "");
    if (!at) continue;
    if (at.page > place.page || at.y + PDF_SLACK >= place.y) return i;
  }
  return Math.max(0, sentences.length - 1);
}

// ── Markdown and text ────────────────────────────────────────────────────

/**
 * Order of md places in a document, as one number: the heading's index in
 * `headings` (document order) and the ‰ through its section. "" (before the
 * first heading) comes first. Null for a heading the document doesn't have.
 */
export function mdOrder(headings: readonly string[]): (place: MdPlace) => number | null {
  const index = new Map(headings.map((h, i) => [h, i]));
  return ({ heading, y }) => {
    if (heading === "") return y;
    const i = index.get(heading);
    return i === undefined ? null : (i + 1) * 1001 + y;
  };
}

/** The md place of a sentence's locator, or null. */
export function mdAt(locator: string): MdPlace | null {
  const l = parseLocator(locator);
  return l?.kind === "md" ? { heading: l.heading, y: l.y } : null;
}

/**
 * The first sentence whose estimated place (its text.json locator, V44) is
 * at or after a place. Only an estimate: the reader then measures the real
 * lines around it (V48).
 */
export function firstMdEstimate(sentences: readonly Pick<Sentence, "locator">[], order: (p: MdPlace) => number | null, place: MdPlace): number {
  const want = order(place) ?? 0;
  for (let i = 0; i < sentences.length; i++) {
    const at = mdAt(sentences[i]?.locator ?? "");
    const key = at ? order(at) : null;
    if (key !== null && key >= want) return i;
  }
  return Math.max(0, sentences.length - 1);
}

/**
 * The place the voice saves for a sentence found in Markdown or text (V48,
 * T53 review FIX): the reader's own place for the line it starts on, from
 * the headings as laid out now. Not the sentence's text.json locator, which
 * was estimated at 70 characters a line.
 */
export function mdVoiceLocator(sections: readonly Section[], line: number, end: number): string {
  const p = placeAt(sections, line, end);
  return formatLocator({ kind: "md", heading: p.heading, y: p.y });
}

// ── The arrow ────────────────────────────────────────────────────────────

/** Where the spoken sentence is from the view: the arrow pill points there (V48). Null: in view. */
export type Direction = "up" | "down" | "left" | "right";

/** The voice holds the reader's place only while it speaks and is followed: paused or follow off, V41 as is (V48). */
export function holdsPlace(status: SpeechStatus, following: boolean): boolean {
  return status === "playing" && following;
}

/** A sentence's span against the view's span on one axis (px, any origin). */
export function directionOf(top: number, bottom: number, viewTop: number, viewBottom: number): "up" | "down" | null {
  if (bottom <= viewTop) return "up";
  if (top >= viewBottom) return "down";
  return null;
}

/** A sentence's page against the open pages of a book. */
export function pageDirection(page: number, open: readonly number[]): "left" | "right" | null {
  const first = open[0];
  const last = open[open.length - 1];
  if (first === undefined || last === undefined) return null;
  if (page < first) return "left";
  if (page > last) return "right";
  return null;
}

// ── Chapters: where "end of chapter" pauses (V49) ──

/**
 * The first sentence of each Markdown chapter after the first. A chapter is
 * the shallowest heading level used at least twice (one `#` title over many
 * `##` makes the `##`s chapters); deeper headings belong to the chapter above.
 * Text before the first chapter is front matter, not a chapter of its own.
 */
export function mdChapterStarts(sentences: readonly Pick<Sentence, "locator">[], headings: readonly { anchor: string; level: number }[]): number[] {
  const counts = new Map<number, number>();
  for (const h of headings) counts.set(h.level, (counts.get(h.level) ?? 0) + 1);
  const levels = [...counts.keys()].sort((a, b) => a - b);
  const level = levels.find((l) => (counts.get(l) ?? 0) >= 2);
  if (level === undefined) return [];
  const chapterOf = new Map<string, number>();
  // A shallower heading before the first chapter (the title) is front matter; after it, it opens a chapter too.
  let chapter = -1;
  for (const h of headings) {
    if (h.level === level || (h.level < level && chapter >= 0)) chapter++;
    chapterOf.set(h.anchor, chapter);
  }
  const starts: number[] = [];
  let last = -1;
  sentences.forEach((s, i) => {
    const place = mdAt(s.locator);
    const c = place === null || place.heading === "" ? -1 : chapterOf.get(place.heading);
    if (c === undefined) return;
    if (c > last && i > 0) starts.push(i);
    last = Math.max(last, c);
  });
  return starts;
}

/** The first sentence on or after each chapter's page (the PDF's top-level contents), after the first sentence. */
export function pdfChapterStarts(sentences: readonly Pick<Sentence, "locator">[], pages: readonly number[]): number[] {
  const want = [...new Set(pages)].sort((a, b) => a - b);
  const starts: number[] = [];
  let k = 0;
  sentences.forEach((s, i) => {
    const at = pdfAt(s.locator);
    if (!at) return;
    let hit = false;
    while (k < want.length && (want[k] ?? 0) <= at.page) {
      k++;
      hit = true;
    }
    if (hit && i > 0) starts.push(i);
  });
  return starts;
}
