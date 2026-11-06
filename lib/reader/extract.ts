// Text for voice (T50, V44): a document's sentences, each with the place it
// starts at in the reader's own locator (V41), so Phase 6 can read a book
// aloud and the reader can follow along. Pure: the worker
// (components/reader/text.worker.ts) feeds it pdf.js text runs or the
// Markdown tree from the reader's own pipeline, and writes what it emits.
//
// Stored on the device as `<sha256>.text.json` (R2 later). The file starts
// with `{"v":<version>,` and only a finished one ends with COMPLETE_TAIL, so a
// write cut short (tab closed, crash) never passes for a finished file. Bump
// EXTRACTOR_VERSION whenever what comes out changes: every older file is then
// extracted again on its next open.

import type { Element, ElementContent, Root, RootContent } from "hast";
import type { TextDocKind } from "./device-protocol";
import { anchorOf, placeAt, type Section } from "./md";
import { formatLocator } from "./reader";

export const EXTRACTOR_VERSION = 1;

export interface Sentence {
  i: number;
  text: string;
  locator: string;
}

/** Longer runs without a sentence end (tables, a PDF with no punctuation, hostile text) are cut at a space, so no "sentence" grows without bound. */
export const MAX_SENTENCE = 1000;

// ── Sentences ────────────────────────────────────────────────────────────

const WS = /\s/;
// Control characters other than whitespace: never wanted in text to be read aloud.
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F]/g;

/** Whitespace (line breaks included) collapsed to single spaces, control characters dropped. Offsets into the result are what sentences report. */
export function cleanText(text: string): string {
  return text.replace(CONTROL, "").replace(/\s+/g, " ");
}

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : null;

/** Sentence ends for engines without Intl.Segmenter: Latin and CJK terminators, then space (or none, after CJK). */
const FALLBACK_END = /[.!?…](?:["'”’)\]]*)\s+|[。！？]+/g;

function rawSegments(text: string): [number, number][] {
  const out: [number, number][] = [];
  if (segmenter) {
    for (const s of segmenter.segment(text)) out.push([s.index, s.index + s.segment.length]);
    return out;
  }
  let from = 0;
  for (const m of text.matchAll(FALLBACK_END)) {
    const to = m.index + m[0].length;
    out.push([from, to]);
    from = to;
  }
  if (from < text.length) out.push([from, text.length]);
  return out;
}

/**
 * The sentences of a cleaned text as [start, end) offsets, trimmed, empty
 * ones left out, none longer than MAX_SENTENCE (a longer one is cut at its
 * last space before the limit, or hard at the limit, never inside a
 * surrogate pair).
 */
export function segment(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of rawSegments(text)) {
    let s = a;
    let e = b;
    while (s < e && WS.test(text.charAt(s))) s++;
    while (e > s && WS.test(text.charAt(e - 1))) e--;
    while (e - s > MAX_SENTENCE) {
      let cut = text.lastIndexOf(" ", s + MAX_SENTENCE);
      if (cut <= s + MAX_SENTENCE / 2) {
        cut = s + MAX_SENTENCE;
        const code = text.charCodeAt(cut);
        if (code >= 0xdc00 && code <= 0xdfff) cut--;
      }
      let end = cut;
      while (end > s && WS.test(text.charAt(end - 1))) end--;
      if (end > s) out.push([s, end]);
      s = cut;
      while (s < e && WS.test(text.charAt(s))) s++;
    }
    if (e > s) out.push([s, e]);
  }
  return out;
}

/**
 * Sentences from text that arrives in pieces (a PDF, page by page), each
 * piece tagged with the locator it starts at. A sentence is emitted once a
 * later one has begun, so one that runs over a page break stays whole and
 * keeps the place it started at. Holds at most the unfinished sentence.
 */
export class SentenceStream {
  #text = "";
  /** Where each piece starts in #text, and its locator. In order. */
  #marks: { at: number; locator: string }[] = [];
  #next = 0;
  readonly #emit: (s: Sentence) => void;

  constructor(emit: (s: Sentence) => void) {
    this.#emit = emit;
  }

  /** Adds a piece of text that starts at `locator`. */
  push(text: string, locator: string): void {
    let clean = cleanText(text);
    if (this.#text === "" || this.#text.endsWith(" ")) clean = clean.trimStart();
    if (clean === "") return;
    const last = this.#marks.at(-1);
    if (last?.at === this.#text.length) last.locator = locator;
    else this.#marks.push({ at: this.#text.length, locator });
    this.#text += clean;
  }

  /** A space between pieces that don't run on (a line end, a page break). */
  space(): void {
    if (this.#text !== "" && !this.#text.endsWith(" ")) this.#text += " ";
  }

  /** Emits every finished sentence; with `end`, the unfinished one too. */
  flush(end = false): void {
    const parts = segment(this.#text);
    const keep = end ? parts.length : parts.length - 1;
    let m = 0;
    for (let k = 0; k < keep; k++) {
      const part = parts[k];
      if (!part) continue;
      while (m + 1 < this.#marks.length && (this.#marks[m + 1]?.at ?? Infinity) <= part[0]) m++;
      this.#emit({ i: this.#next++, text: this.#text.slice(part[0], part[1]), locator: this.#marks[m]?.locator ?? "" });
    }
    const rest = end ? undefined : parts[parts.length - 1];
    if (!rest) {
      this.#text = "";
      this.#marks = [];
      return;
    }
    // Keep the unfinished sentence and the marks inside it (plus the one it starts under), shifted to 0.
    const from = rest[0];
    let first = 0;
    while (first + 1 < this.#marks.length && (this.#marks[first + 1]?.at ?? Infinity) <= from) first++;
    this.#marks = this.#marks.slice(first).map((mk, k) => ({ at: k === 0 ? 0 : mk.at - from, locator: mk.locator }));
    this.#text = this.#text.slice(from);
  }

  get count(): number {
    return this.#next;
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────

/** The parts of a pdf.js document extraction uses (real pdf.js in the worker and the test). */
export interface PdfSource {
  numPages: number;
  getPage(n: number): Promise<PdfPageSource>;
  /** Frees pdf.js's caches (fonts, page objects); called every so often on long books. */
  cleanup?: () => Promise<void>;
}

export interface PdfPageSource {
  getViewport(o: { scale: number }): { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] };
  getTextContent(): Promise<{ items: readonly unknown[] }>;
  cleanup(): unknown;
}

interface TextRun {
  str: string;
  hasEOL: boolean;
  transform: number[];
  height: number;
}

function isRun(item: unknown): item is TextRun {
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string" && "transform" in item && Array.isArray(item.transform);
}

const CLEANUP_EVERY = 200;

/**
 * Every sentence of a PDF, page by page (only one page's text is held at a
 * time). A sentence's locator is `pdf:<page>:<y‰>` for the top of the text
 * run it starts in, the reader's own place for that line (V41). A page that
 * can't be read is skipped. Stops quietly when `signal` aborts.
 */
export async function extractPdf(
  pdf: PdfSource,
  emit: (s: Sentence) => void,
  signal: AbortSignal,
  onPage?: (done: number, total: number) => void,
): Promise<void> {
  const stream = new SentenceStream(emit);
  for (let n = 1; n <= pdf.numPages; n++) {
    onPage?.(n - 1, pdf.numPages);
    if (signal.aborted) return;
    try {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!isRun(item)) continue;
        if (item.str) {
          const [, , , , e = 0, f = 0] = item.transform;
          const [, y1 = 0] = viewport.convertToViewportPoint(e, f);
          const [, y2 = 0] = viewport.convertToViewportPoint(e, f + (item.height || 0));
          const raw = viewport.height > 0 ? Math.min(y1, y2) / viewport.height : 0;
          // A hostile text matrix can make it NaN (Infinity × 0), which no locator may hold.
          const top = Number.isFinite(raw) ? raw : 0;
          stream.push(item.str, formatLocator({ kind: "pdf", page: n, y: Math.floor(Math.min(1, Math.max(0, top)) * 1000) }));
        }
        if (item.hasEOL) stream.space();
      }
      page.cleanup();
    } catch {
      // An unreadable page reads as no text.
    }
    stream.space();
    stream.flush();
    if (n % CLEANUP_EVERY === 0) await pdf.cleanup?.().catch(() => undefined);
  }
  if (!signal.aborted) stream.flush(true);
}

// ── Markdown and text ────────────────────────────────────────────────────

/**
 * Text has no layout in a worker, so a place inside a section is measured in
 * estimated lines at this many characters a line (each block adds a blank
 * line after it). Close to where the reader puts it; Phase 6 finds the
 * sentence on the open page by its text.
 */
export const LINE_CHARS = 70;

interface Block {
  text: string;
  /** Where the block starts, in estimated lines from the top. */
  top: number;
  lines: number;
}

function linesOf(len: number): number {
  return Math.max(1, Math.ceil(len / LINE_CHARS));
}

/** Sentences of laid-out blocks, each placed `md:<heading>:<y‰>` between its heading and the next (V41, placeAt). */
function emitBlocks(blocks: readonly Block[], sections: readonly Section[], end: number, emit: (s: Sentence) => void, signal: AbortSignal): void {
  let i = 0;
  // Sentences come in document order, so the section they're in only moves down: placeAt gets just it and the next.
  let k = -1;
  for (const b of blocks) {
    if (signal.aborted) return;
    const len = b.text.length;
    for (const [s, e] of segment(b.text)) {
      const at = b.top + (len > 0 ? (b.lines * s) / len : 0);
      while ((sections[k + 1]?.top ?? Infinity) <= at) k++;
      const place = placeAt(sections.slice(Math.max(0, k), k + 2), at, end);
      emit({ i: i++, text: b.text.slice(s, e), locator: formatLocator({ kind: "md", heading: place.heading, y: place.y }) });
    }
  }
}

/** Plain text as the reader shows it (md-body.tsx TextBody): paragraphs at blank lines, line breaks kept. Locators `md::<y‰>`. */
export function extractText(raw: string, emit: (s: Sentence) => void, signal: AbortSignal): void {
  const blocks: Block[] = [];
  let top = 0;
  for (const para of raw.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n\s*/)) {
    const lines = para.split("\n").reduce((sum, line) => sum + linesOf(line.length), 0);
    const text = cleanText(para).trim();
    if (text) blocks.push({ text, top, lines });
    top += lines + 1;
  }
  emitBlocks(blocks, [], top, emit, signal);
}

/** Elements that start a block of their own; anything else flows inside one. */
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "dd", "details", "div", "dl", "dt", "figcaption", "figure",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "footer", "li", "main", "nav", "ol", "p", "section",
  "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function classes(el: Element): readonly unknown[] {
  const c = el.properties.className;
  return Array.isArray(c) ? c : [];
}

/** Nothing to read aloud: code, images, form bits, footnote markers, and the footnotes themselves (the reader leaves their heading out of its places too). */
function skipped(el: Element): boolean {
  if (el.tagName === "pre" || el.tagName === "img" || el.tagName === "input" || el.tagName === "svg" || el.tagName === "hr") return true;
  if (el.tagName === "section" && (el.properties.dataFootnotes !== undefined || classes(el).includes("footnotes"))) return true;
  if (el.properties.dataFootnoteRef !== undefined || el.properties.dataFootnoteBackref !== undefined) return true;
  return false;
}

function codeLines(el: Element): number {
  let text = "";
  const walk = (nodes: readonly ElementContent[]) => {
    for (const n of nodes) {
      if (n.type === "text") text += n.value;
      else if (n.type === "element") walk(n.children);
    }
  };
  walk(el.children);
  return text.replace(/\n$/, "").split("\n").length;
}

/**
 * Sentences of a Markdown document from the tree the reader renders (the
 * reader's own pipeline: GFM, sanitize, slug, lib/reader/md-pipeline.ts), so
 * headings are the same anchors the reader places by. Code blocks take room
 * but are not read; footnotes are left out.
 */
export function extractMarkdown(tree: Root, emit: (s: Sentence) => void, signal: AbortSignal): void {
  const blocks: Block[] = [];
  const sections: Section[] = [];
  let top = 0;
  let inline = "";

  const flush = (heading: string | null) => {
    const text = cleanText(inline).trim();
    inline = "";
    if (heading !== null) sections.push({ anchor: heading, top });
    if (!text) return;
    const lines = heading !== null ? 1 : linesOf(text.length);
    blocks.push({ text, top, lines });
    top += lines + 1;
  };

  const walk = (nodes: readonly (RootContent | ElementContent)[]) => {
    for (const n of nodes) {
      if (n.type === "text") inline += n.value;
      else if (n.type !== "element") continue;
      else if (n.tagName === "br") inline += " ";
      else if (n.tagName === "pre") {
        flush(null);
        top += codeLines(n) + 1;
      } else if (skipped(n)) continue;
      else if (HEADINGS.has(n.tagName)) {
        flush(null);
        const anchor = typeof n.properties.id === "string" ? anchorOf(n.properties.id) : null;
        walk(n.children);
        flush(anchor);
      } else if (BLOCK_TAGS.has(n.tagName)) {
        flush(null);
        walk(n.children);
        flush(null);
      } else walk(n.children);
    }
  };
  walk(tree.children);
  flush(null);
  emitBlocks(blocks, sections, top, emit, signal);
}

// ── The file ─────────────────────────────────────────────────────────────

export interface TextFile {
  v: number;
  kind: TextDocKind;
  sha256: string;
  sentences: Sentence[];
}

/** Only a finished file ends with this. A string in the JSON can't hold it: its quotes would be escaped. */
export const COMPLETE_TAIL = '],"complete":true}';

export function textFileHead(kind: TextDocKind, sha256: string): string {
  return `{"v":${String(EXTRACTOR_VERSION)},"kind":${JSON.stringify(kind)},"sha256":${JSON.stringify(sha256)},"sentences":[`;
}

/** Whether a stored file is finished and made by this extractor, from its first and last bytes only. */
export function isCurrent(head: string, tail: string): boolean {
  return head.startsWith(`{"v":${String(EXTRACTOR_VERSION)},`) && tail.endsWith(COMPLETE_TAIL);
}

/** A stored file read back, or null when it's cut short, old, for another file, or not ours. */
export function parseTextFile(raw: string, sha256: string): TextFile | null {
  if (!isCurrent(raw.slice(0, 32), raw.slice(-COMPLETE_TAIL.length))) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const f = data as Partial<TextFile>;
    if (f.v !== EXTRACTOR_VERSION || f.sha256 !== sha256 || !Array.isArray(f.sentences)) return null;
    if (f.kind !== "pdf" && f.kind !== "md" && f.kind !== "txt") return null;
    return { v: f.v, kind: f.kind, sha256, sentences: f.sentences };
  } catch {
    return null;
  }
}
