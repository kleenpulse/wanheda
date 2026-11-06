// The Markdown / text reader's pure parts (T48, V41): where the reader is, as
// a heading anchor and a fraction of that section; find over the rendered
// text; and the code-fence names Shiki can highlight. Client-safe.

import { queryPattern } from "./book";

/** rehype-sanitize prefixes every id in the document with this (DOM clobbering); rehype-slug adds the same to heading ids. */
export const ID_PREFIX = "user-content-";

/** A locator's heading: letters, digits, marks, `_` and `-`, what github-slugger leaves (V41). */
const ANCHOR_RE = /^[\p{L}\p{N}\p{M}_-]{1,200}$/u;

/** The locator's heading for an element id, or null when it can't be one (the place then counts from the section before). */
export function anchorOf(id: string): string | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const anchor = id.slice(ID_PREFIX.length);
  return ANCHOR_RE.test(anchor) ? anchor : null;
}

/** The element id a locator's heading names. */
export function idOf(anchor: string): string {
  return ID_PREFIX + anchor;
}

/** A heading's place in the scrolled content: its anchor and how far down it starts, in px. */
export interface Section {
  anchor: string;
  top: number;
}

export interface MdPlace {
  /** The heading the reader is under, "" before the first one (or in a document with none). */
  heading: string;
  /** How far through that section, 0–1000 (‰). */
  y: number;
}

/**
 * The place at a reading line: the last heading at or above it, and how far
 * the line is between that heading and the next (the end of the content
 * after the last). Above the first heading the section is the lead-in from
 * the top. Sections must be in document order.
 */
export function placeAt(sections: readonly Section[], line: number, end: number): MdPlace {
  let i = -1;
  for (let k = 0; k < sections.length; k++) {
    const s = sections[k];
    if (s && s.top <= line) i = k;
    else break;
  }
  const from = i < 0 ? 0 : (sections[i]?.top ?? 0);
  const to = sections[i + 1]?.top ?? end;
  const span = to - from;
  const y = span > 0 ? Math.min(1000, Math.max(0, ((line - from) / span) * 1000)) : 0;
  return { heading: i < 0 ? "" : (sections[i]?.anchor ?? ""), y: Math.round(y) };
}

/**
 * Where the reading line goes for a place: back between the same heading and
 * the next, at the same fraction (so another width or text size still lands
 * in the same part of the same section). A heading this document doesn't
 * have resumes from the top. Null when there is nothing to scroll to.
 */
export function lineFor(sections: readonly Section[], place: MdPlace, end: number): number | null {
  if (place.heading === "") {
    const to = sections[0]?.top ?? end;
    return (to * place.y) / 1000;
  }
  const i = sections.findIndex((s) => s.anchor === place.heading);
  const s = sections[i];
  if (!s) return null;
  const to = sections[i + 1]?.top ?? end;
  return s.top + ((to - s.top) * place.y) / 1000;
}

/** How far through the whole document, 0–100. Nothing to scroll counts as read. */
export function scrollPercent(scrollTop: number, maxScroll: number): number {
  if (maxScroll <= 1) return 100;
  return Math.min(100, Math.max(0, Math.round((scrollTop / maxScroll) * 100)));
}

/** At most this many matches are marked; a search for "e" in a long book stops there. */
export const MAX_MATCHES = 5000;

/**
 * Every match of a (normalised) query in the text, as [start, end) offsets
 * into the original string: case-insensitive with Unicode folding, any
 * whitespace between words (book.ts queryPattern). Capped at MAX_MATCHES.
 */
export function findRanges(text: string, query: string): [number, number][] {
  const re = queryPattern(query);
  if (!re) return [];
  const out: [number, number][] = [];
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue;
    out.push([m.index, m.index + m[0].length]);
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

// ── Code fences ──────────────────────────────────────────────────────────

/** The grammars the reader loads (one chunk each, fetched the first time a document uses it). */
export const SHIKI_LANGS = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "dart",
  "diff",
  "dockerfile",
  "elixir",
  "go",
  "graphql",
  "haskell",
  "html",
  "ini",
  "java",
  "javascript",
  "json",
  "jsonc",
  "jsx",
  "kotlin",
  "lua",
  "markdown",
  "php",
  "powershell",
  "python",
  "ruby",
  "rust",
  "scss",
  "sql",
  "swift",
  "toml",
  "tsx",
  "typescript",
  "vue",
  "xml",
  "yaml",
  "zig",
] as const;

export type ShikiLang = (typeof SHIKI_LANGS)[number];

const ALIASES: Record<string, ShikiLang> = {
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  zsh: "bash",
  console: "bash",
  "c++": "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  "c#": "csharp",
  docker: "dockerfile",
  ex: "elixir",
  exs: "elixir",
  golang: "go",
  gql: "graphql",
  hs: "haskell",
  htm: "html",
  conf: "ini",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json5: "jsonc",
  kt: "kotlin",
  md: "markdown",
  ps1: "powershell",
  pwsh: "powershell",
  ps: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  svg: "xml",
  yml: "yaml",
};

const KNOWN = new Set<string>(SHIKI_LANGS);

/** The grammar for a fence's info string (`ts`, `Python`, `c++`), or null: that block stays plain. */
export function shikiLang(fence: string | null | undefined): ShikiLang | null {
  if (!fence) return null;
  const name = fence.trim().toLowerCase();
  if (KNOWN.has(name)) return name as ShikiLang;
  return Object.hasOwn(ALIASES, name) ? (ALIASES[name] ?? null) : null;
}

/** Longer blocks stay plain: Shiki runs on the main thread and a huge one would stall the page. */
export const HIGHLIGHT_MAX_CHARS = 40_000;
