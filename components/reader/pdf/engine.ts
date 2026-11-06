"use client";

import { pdfjs } from "react-pdf";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { queryPattern, renderScale, textHas } from "@/lib/reader/book";
import { onForget } from "../doc-cache";

// pdf.js for the reader (T47), browser only: loaded through next/dynamic with
// ssr off, because pdf.js needs DOMMatrix and canvas. Everything about the
// PDF itself is hostile input (V40):
// - the worker is this app's own copy, emitted by the bundler and served
//   from this origin (never a CDN, never a file copied into public/);
// - pdf.js 6 has no eval path at all (lib/reader/pdfjs-bundle.test.ts);
// - wasm decoders come from the same place, through BinaryDataFactory, and
//   nothing else may be fetched for a document;
// - the annotation layer stays off, so a PDF's links and forms never render.

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const WASM: Readonly<Record<string, URL>> = {
  "openjpeg.wasm": new URL("pdfjs-dist/wasm/openjpeg.wasm", import.meta.url),
  "jbig2.wasm": new URL("pdfjs-dist/wasm/jbig2.wasm", import.meta.url),
};

/** pdf.js asks the page for binary data by file name; only the two image decoders are given. */
class SameOriginData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = kind === "wasmUrl" ? WASM[filename] : undefined;
    if (!url) throw new Error(`No ${kind} data: ${filename}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${filename}: ${String(res.status)}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Big files are read in ranges straight from the File, so a 14,000-page book never sits whole in memory. */
const RANGE_FROM_BYTES = 16 * 1024 * 1024;

/**
 * Reads the ranges pdf.js asks for straight from the File. A read can fail
 * (the device copy was removed or replaced under an open document): pdf.js
 * would wait for that range forever, so the failure is reported instead and
 * the document is closed as unreadable.
 */
class FileRange extends pdfjs.PDFDataRangeTransport {
  readonly #file: File;
  readonly #onFail: () => void;
  constructor(file: File, onFail: () => void) {
    super(file.size, null);
    this.#file = file;
    this.#onFail = onFail;
  }
  override requestDataRange(begin: number, end: number): void {
    this.#file
      .slice(begin, end)
      .arrayBuffer()
      .then(
        (b) => {
          this.onDataRange(begin, new Uint8Array(b));
        },
        () => {
          this.#onFail();
        },
      );
  }
}

/** Starts loading a file. The task is what tears the document (and its worker) down again. `onFail`: a later read of the file failed. */
function load(file: File, onFail: () => void = () => undefined): { task: Promise<PDFDocumentLoadingTask>; doc: Promise<PDFDocumentProxy> } {
  const task = (async () => {
    const big = file.size > RANGE_FROM_BYTES;
    return pdfjs.getDocument({
      ...(big ? { range: new FileRange(file, onFail), length: file.size, disableAutoFetch: true, disableStream: true } : { data: new Uint8Array(await file.arrayBuffer()) }),
      BinaryDataFactory: SameOriginData,
      useWorkerFetch: false,
      enableXfa: false,
      stopAtErrors: false,
    });
  })();
  return { task, doc: task.then((t) => t.promise) };
}

function destroy(task: Promise<PDFDocumentLoadingTask>) {
  void task.then((t) => t.destroy()).catch(() => undefined);
}

/**
 * The open document, kept after the viewer closes so going back to it paints
 * at once (V24). One at a time: opening another closes it.
 */
let held: { sha: string; task: Promise<PDFDocumentLoadingTask>; doc: Promise<PDFDocumentProxy> } | null = null;

/** Told when the held document turns out unreadable after it opened (see FileRange). */
const brokenListeners = new Set<(sha256: string) => void>();

export function openPdf(sha256: string, file: File): Promise<PDFDocumentProxy> {
  if (held?.sha === sha256) return held.doc;
  closeHeld();
  const ref: { doc: Promise<PDFDocumentProxy> | null } = { doc: null };
  const { task, doc } = load(file, () => {
    if (!ref.doc || held?.doc !== ref.doc) return;
    closeHeld();
    for (const fn of brokenListeners) fn(sha256);
  });
  ref.doc = doc;
  held = { sha: sha256, task, doc };
  doc.catch(() => {
    if (held?.doc === doc) closeHeld();
  });
  return doc;
}

/** The hash of the document the engine holds open, or null. Only a held document may be reused: a failed open closes the one before it. */
export function heldSha(): string | null {
  return held?.sha ?? null;
}

/** Calls `fn` when the held document becomes unreadable. Returns the unsubscribe function. */
export function onBroken(fn: (sha256: string) => void): () => void {
  brokenListeners.add(fn);
  return () => {
    brokenListeners.delete(fn);
  };
}

// A deleted document's open PDF goes with it.
onForget((sha256) => {
  if (held?.sha === sha256) closeHeld();
});

function closeHeld() {
  if (!held) return;
  const { task } = held;
  held = null;
  images.clear();
  thumbs.clear();
  texts.clear();
  destroy(task);
}

// ── Page images ──────────────────────────────────────────────────────────

export interface PageImage {
  url: string;
  /** CSS width it was rendered sharp for. */
  width: number;
  /** Page height / width at scale 1. */
  aspect: number;
}

/**
 * Rendered pages of the held document, oldest first. Small: the book asks
 * for the spread ± 1 (V42) and this keeps a few more, so turning back is
 * instant. Every image dropped has its URL revoked.
 */
class ImageCache {
  readonly #max: number;
  readonly #map = new Map<number, PageImage>();
  constructor(max: number) {
    this.#max = max;
  }
  get(page: number, width: number): PageImage | null {
    const hit = this.#map.get(page);
    if (!hit || hit.width < width * 0.9) return null;
    this.#map.delete(page);
    this.#map.set(page, hit);
    return hit;
  }
  /** Any image of a page, sharp or not: a blurry page beats a blank one while the sharp one renders. */
  any(page: number): PageImage | null {
    return this.#map.get(page) ?? null;
  }
  put(page: number, img: PageImage) {
    const old = this.#map.get(page);
    if (old && old.url !== img.url) URL.revokeObjectURL(old.url);
    this.#map.delete(page);
    this.#map.set(page, img);
    while (this.#map.size > this.#max) {
      const [first] = this.#map;
      if (!first) break;
      URL.revokeObjectURL(first[1].url);
      this.#map.delete(first[0]);
    }
  }
  clear() {
    for (const img of this.#map.values()) URL.revokeObjectURL(img.url);
    this.#map.clear();
  }
}

const images = new ImageCache(10);
/** Thumbnails apart, so opening the grid never pushes the open spread out. */
const thumbs = new ImageCache(120);

export function cachedImage(page: number, width: number): PageImage | null {
  return images.get(page, width);
}

export function anyImage(page: number): PageImage | null {
  return images.any(page);
}

/** Drops every page image (the book closing for good, or memory to give back). */
export function dropImages(): void {
  images.clear();
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

/** Draws a page onto a fresh canvas, then frees the canvas. Resolves null when cancelled or failed. */
async function paint(page: PDFPageProxy, scale: number, quality: number, signal?: AbortSignal): Promise<Blob | null> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const task = page.render({ canvas, viewport });
  const cancel = () => {
    task.cancel();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
    return signal?.aborted ? null : await toBlob(canvas, quality);
  } catch {
    return null;
  } finally {
    signal?.removeEventListener("abort", cancel);
    // A canvas keeps its bitmap until it's collected; zero it now.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** One page as an image sharp at `cssWidth`, from the cache or freshly rendered. */
export function pageImage(pdf: PDFDocumentProxy, n: number, cssWidth: number, signal?: AbortSignal): Promise<PageImage | null> {
  return renderInto(images, pdf, n, cssWidth, signal);
}

export const THUMB_WIDTH = 120;

export function cachedThumb(n: number): PageImage | null {
  return thumbs.get(n, THUMB_WIDTH);
}

/** A page for the thumbnail grid. */
export function thumbImage(pdf: PDFDocumentProxy, n: number, signal?: AbortSignal): Promise<PageImage | null> {
  return renderInto(thumbs, pdf, n, THUMB_WIDTH, signal);
}

async function renderInto(cache: ImageCache, pdf: PDFDocumentProxy, n: number, cssWidth: number, signal?: AbortSignal): Promise<PageImage | null> {
  const hit = cache.get(n, cssWidth);
  if (hit) return hit;
  let page: PDFPageProxy;
  try {
    page = await pdf.getPage(n);
  } catch {
    return null;
  }
  const base = page.getViewport({ scale: 1 });
  const scale = renderScale(base.width, base.height, cssWidth, window.devicePixelRatio || 1);
  const blob = await paint(page, scale, 0.92, signal);
  // The page's fonts and operator lists aren't needed once it's an image.
  page.cleanup();
  if (!blob || signal?.aborted) return null;
  const img: PageImage = { url: URL.createObjectURL(blob), width: cssWidth, aspect: base.height / base.width };
  cache.put(n, img);
  return img;
}

/** Page 1's shape, height / width. */
export async function firstPageAspect(pdf: PDFDocumentProxy): Promise<number> {
  try {
    const page = await pdf.getPage(1);
    const v = page.getViewport({ scale: 1 });
    return v.height / v.width;
  } catch {
    return Math.SQRT2;
  }
}

// ── Covers ───────────────────────────────────────────────────────────────

const COVER_CSS_WIDTH = 360;

/** Page one as a small webp, for the library (T46 covers fall back to generated ones). */
export async function coverOf(pdf: PDFDocumentProxy): Promise<Blob | null> {
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const blob = await paint(page, renderScale(base.width, base.height, COVER_CSS_WIDTH, 1), 0.82);
    page.cleanup();
    return blob;
  } catch {
    return null;
  }
}

/** A cover straight from a file just added, without holding the document open. */
export async function coverOfFile(file: File): Promise<Blob | null> {
  const { task, doc } = load(file);
  try {
    return await coverOf(await doc);
  } catch {
    return null;
  } finally {
    destroy(task);
  }
}

// ── Text and find ────────────────────────────────────────────────────────

interface Run {
  str: string;
  /** Box as fractions of the page: left, top, width, height. */
  box: [number, number, number, number];
  /** Where the run starts in the page's joined text. */
  start: number;
}

/** A page's text runs, joined the way pdf.js's own find joins them: back to back, a space at each line end. */
async function readPage(pdf: PDFDocumentProxy, n: number, withBoxes: boolean): Promise<{ text: string; runs: Run[] }> {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  let text = "";
  const runs: Run[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    if (withBoxes && item.str) {
      const [, , , , e = 0, f = 0] = item.transform as number[];
      const [x1 = 0, y1 = 0] = viewport.convertToViewportPoint(e, f) as number[];
      const [x2 = 0, y2 = 0] = viewport.convertToViewportPoint(e + item.width, f + item.height) as number[];
      runs.push({
        str: item.str,
        start: text.length,
        box: [Math.min(x1, x2) / viewport.width, Math.min(y1, y2) / viewport.height, Math.abs(x2 - x1) / viewport.width, Math.abs(y2 - y1) / viewport.height],
      });
    }
    text += item.str + (item.hasEOL ? " " : "");
  }
  page.cleanup();
  return { text, runs };
}

/** Pages' text for find, lower-cased with spaces collapsed: one string a page and no boxes, so a long search stays small. */
const TEXT_CACHE = 3000;
const texts = new Map<number, Promise<string>>();

function searchText(pdf: PDFDocumentProxy, n: number): Promise<string> {
  const hit = texts.get(n);
  if (hit) return hit;
  const p = readPage(pdf, n, false)
    .then(({ text }) => text.replace(/\s+/g, " ").toLowerCase())
    .catch(() => "");
  texts.set(n, p);
  if (texts.size > TEXT_CACHE) {
    const [first] = texts.keys();
    if (first !== undefined) texts.delete(first);
  }
  return p;
}

/**
 * Boxes around every run a match touches, as fractions of the page. Read
 * fresh (only the open pages ask) and matched on the joined text, so a word
 * pdf.js split across runs is still found and boxed.
 */
export async function matchBoxes(pdf: PDFDocumentProxy, n: number, query: string): Promise<Run["box"][]> {
  const re = queryPattern(query);
  if (!re) return [];
  const { text, runs } = await readPage(pdf, n, true).catch(() => ({ text: "", runs: [] as Run[] }));
  const hit = new Set<Run>();
  for (const m of text.matchAll(re)) {
    const from = m.index;
    const to = from + m[0].length;
    for (const r of runs) if (r.start < to && r.start + r.str.length > from) hit.add(r);
  }
  return [...hit].map((r) => r.box);
}

/**
 * The next page holding the query, going `dir` from `from` (that page left
 * out) and wrapping round. Yields between pages, so a search through a
 * 14,000-page book never blocks the page; `onPage` reports where it is.
 */
export async function findPage(
  pdf: PDFDocumentProxy,
  query: string,
  from: number,
  dir: 1 | -1,
  signal: AbortSignal,
  onPage?: (page: number) => void,
): Promise<number | null> {
  const n = pdf.numPages;
  if (!query || n === 0) return null;
  for (let step = 1; step <= n; step++) {
    if (signal.aborted) return null;
    const page = ((((from - 1 + dir * step) % n) + n) % n) + 1;
    if (step % 25 === 0) {
      onPage?.(page);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (textHas(await searchText(pdf, page), query)) return page;
  }
  return null;
}
