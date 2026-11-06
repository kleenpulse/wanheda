import { z } from "zod";

// Reader (FRD 6.5, T46), pure and client-safe: shapes, write schemas, locators,
// the progress rule and the library's filters. The server store and the
// browser both build on it, so they can't disagree.

export const READER_KEY = ["reader"] as const;

export const DOC_KINDS = ["pdf", "md", "txt", "epub"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const READING_MODES = ["scroll", "flip"] as const;
export type ReadingMode = (typeof READING_MODES)[number];

/** How a new document first opens (V42): a PDF as a book, text as a scroll. */
export function defaultModeFor(kind: DocKind): ReadingMode {
  return kind === "pdf" ? "flip" : "scroll";
}

/** Size caps per kind (SPEC V38). The same caps hold for local files, so turning R2 on later never strands one. */
export const SIZE_CAP: Record<DocKind, number> = {
  pdf: 200 * 1024 * 1024,
  epub: 200 * 1024 * 1024,
  md: 5 * 1024 * 1024,
  txt: 5 * 1024 * 1024,
};

/** Kinds this checkpoint can open. EPUB arrives with T52. */
export const OPENABLE_KINDS: readonly DocKind[] = ["pdf", "md", "txt"];

export interface Progress {
  /** `pdf:<page>:<y‰>` | `md:<heading-id>:<y‰>` | `epub:<cfi>` (V41). */
  locator: string;
  percent: number;
  /** The client's clock at this position, epoch ms. */
  at: number;
}

export interface ReaderDoc {
  id: string;
  kind: DocKind;
  title: string;
  author: string | null;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  pages: number | null;
  tags: string[];
  mode: ReadingMode;
  /** Collection ids, sorted. */
  collections: string[];
  progress: Progress | null;
  lastOpenedAt: number | null;
  createdAt: number;
  /** Demo only: the sample's text, so a seed doc opens with nothing on the device. */
  sample?: string;
}

export interface Collection {
  id: string;
  name: string;
}

export type ReaderSource = "owner" | "demo" | "load-failed";

export interface ReaderPayload {
  source: ReaderSource;
  documents: ReaderDoc[];
  collections: Collection[];
}

export const EMPTY_READER: Omit<ReaderPayload, "source"> = { documents: [], collections: [] };

// ── Files ────────────────────────────────────────────────────────────────

const EXT_KIND: Record<string, DocKind> = { pdf: "pdf", md: "md", markdown: "md", txt: "txt", text: "txt", epub: "epub" };
const MIME_KIND: Record<string, DocKind> = {
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/plain": "txt",
  "application/epub+zip": "epub",
};

/** The kind of a picked file: its extension first (browsers often leave `.md` untyped), then its type. */
export function kindOf(name: string, mime: string): DocKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return (ext ? EXT_KIND[ext] : undefined) ?? MIME_KIND[mime.split(";")[0]?.trim().toLowerCase() ?? ""] ?? null;
}

export type FileCheck = { ok: true; kind: DocKind } | { ok: false; reason: "kind" | "unsupported" | "empty" | "too-big"; kind?: DocKind };

/** Whether a picked file can join the library on this checkpoint. */
export function checkFile(name: string, mime: string, size: number): FileCheck {
  const kind = kindOf(name, mime);
  if (!kind) return { ok: false, reason: "kind" };
  if (!OPENABLE_KINDS.includes(kind)) return { ok: false, reason: "unsupported", kind };
  if (size === 0) return { ok: false, reason: "empty", kind };
  if (size > SIZE_CAP[kind]) return { ok: false, reason: "too-big", kind };
  return { ok: true, kind };
}

export const TITLE_MAX = 300;

/** A title from a file name: no extension, separators to spaces, trimmed. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]{1,8}$/i, "");
  const spaced = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (spaced || "Untitled").slice(0, TITLE_MAX);
}

export const SHA256_RE = /^[0-9a-f]{64}$/;

// ── Locators (V41) ───────────────────────────────────────────────────────

export type Locator =
  | { kind: "pdf"; page: number; y: number }
  | { kind: "md"; heading: string; y: number }
  | { kind: "epub"; cfi: string };

const PERMILLE = (n: number) => Math.min(1000, Math.max(0, Math.round(n)));
/**
 * An md place keeps hundredths of a ‰ (V41, amended 2026-11-06, T49): one ‰ of
 * a long section with no headings can span pages, and a book page must read
 * back as the same page. Written without trailing zeros (`452.3`, `350`).
 */
const MD_PERMILLE = (n: number) => Math.min(1000, Math.max(0, Math.round(n * 100) / 100));

export function formatLocator(l: Locator): string {
  switch (l.kind) {
    case "pdf":
      return `pdf:${String(Math.max(1, Math.round(l.page)))}:${String(PERMILLE(l.y))}`;
    case "md":
      return `md:${l.heading}:${String(MD_PERMILLE(l.y))}`;
    case "epub":
      return `epub:${l.cfi}`;
  }
}

// A heading slug as github-slugger writes it (rehype-slug, T48): Unicode letters,
// digits and marks, `_` and `-`, never a colon. Empty: before the first heading.
const HEADING_RE = /^[\p{L}\p{N}\p{M}_-]{0,200}$/u;

/** Parses a stored locator; null for anything malformed. */
export function parseLocator(raw: string): Locator | null {
  const pdf = /^pdf:(\d{1,6}):(\d{1,4})$/.exec(raw);
  if (pdf) {
    const page = Number(pdf[1]);
    const y = Number(pdf[2]);
    return page >= 1 && y <= 1000 ? { kind: "pdf", page, y } : null;
  }
  const md = /^md:([^:]*):(\d{1,4}(?:\.\d{1,2})?)$/.exec(raw);
  if (md) {
    const heading = md[1] ?? "";
    const y = Number(md[2]);
    return HEADING_RE.test(heading) && y <= 1000 ? { kind: "md", heading, y } : null;
  }
  const epub = /^epub:(.{1,512})$/s.exec(raw);
  if (epub?.[1]) return { kind: "epub", cfi: epub[1] };
  return null;
}

/** The locator family a document kind takes: txt reads like md. */
export function locatorKindFor(kind: DocKind): Locator["kind"] {
  return kind === "txt" ? "md" : kind;
}

// ── Progress (V41) ───────────────────────────────────────────────────────

/** How far ahead of the server's clock a client `at` may be before it's pulled back. */
export const PROGRESS_SKEW_MS = 5 * 60_000;

/** Never trust a client clock to win forever: a write from the future is held to now. */
export function clampAt(at: number, now: number): number {
  return Math.min(at, now + PROGRESS_SKEW_MS);
}

/** Whether `next` should replace `current`: only a strictly newer position wins (V41). */
export function isNewer(next: Pick<Progress, "at">, current: Pick<Progress, "at"> | null): boolean {
  return current === null || next.at > current.at;
}

/** The newer of two positions; ties keep the first. */
export function newerProgress(a: Progress | null, b: Progress | null): Progress | null {
  if (!a) return b;
  if (!b) return a;
  return b.at > a.at ? b : a;
}

// ── Write schemas ────────────────────────────────────────────────────────

const tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((t) => t.toLowerCase());

export const TAGS_MAX = 20;

/** Lower-cased, unique, sorted. */
export function cleanTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 40))].sort().slice(0, TAGS_MAX);
}

const tags = z.array(tag).max(TAGS_MAX).transform(cleanTags);

/** A new document: metadata only, never bytes (V38). */
export const documentCreateSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(DOC_KINDS),
    title: z.string().trim().min(1).max(TITLE_MAX),
    author: z.string().trim().max(200).nullable(),
    fileName: z.string().max(255),
    sha256: z.string().regex(SHA256_RE),
    sizeBytes: z.number().int().positive(),
    pages: z.number().int().positive().max(100_000).nullable(),
    tags,
  })
  .strict()
  .refine((d) => d.sizeBytes <= SIZE_CAP[d.kind], { message: "too big", path: ["sizeBytes"] });

export type DocumentCreate = z.infer<typeof documentCreateSchema>;

/** Edits to a document's metadata. Collections are replaced whole. */
export const documentPatchSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    author: z.string().trim().max(200).nullable().optional(),
    tags: tags.optional(),
    mode: z.enum(READING_MODES).optional(),
    /** A PDF's page count, read by pdf.js on this device (T49). */
    pages: z.number().int().positive().max(100_000).optional(),
    collections: z.array(z.uuid()).max(100).optional(),
  })
  .strict();

export type DocumentPatch = z.infer<typeof documentPatchSchema>;

export const idSchema = z.object({ id: z.uuid() }).strict();

export const collectionWriteSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(60),
  })
  .strict();

export type CollectionWrite = z.infer<typeof collectionWriteSchema>;

export const progressWriteSchema = z
  .object({
    documentId: z.uuid(),
    locator: z.string().max(600).refine((l) => parseLocator(l) !== null, "bad locator"),
    percent: z.number().int().min(0).max(100),
    at: z.number().int().positive(),
  })
  .strict();

export type ProgressWrite = z.infer<typeof progressWriteSchema>;

// ── Library ──────────────────────────────────────────────────────────────

/** Opened most recently first, then never-opened by when they were added. */
export function sortLibrary(docs: readonly ReaderDoc[]): ReaderDoc[] {
  return [...docs].sort((a, b) => (b.lastOpenedAt ?? -1) - (a.lastOpenedAt ?? -1) || b.createdAt - a.createdAt || a.title.localeCompare(b.title));
}

export interface LibraryFilter {
  query: string;
  tag: string | null;
  collection: string | null;
}

/** Docs matching every part of a filter. The query matches title, author, file name and tags, any order. */
export function filterLibrary(docs: readonly ReaderDoc[], f: LibraryFilter): ReaderDoc[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return docs.filter((d) => {
    if (f.tag && !d.tags.includes(f.tag)) return false;
    if (f.collection && !d.collections.includes(f.collection)) return false;
    if (words.length === 0) return true;
    const hay = [d.title, d.author ?? "", d.fileName, ...d.tags].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Every tag in use, most used first. */
export function tagsInUse(docs: readonly ReaderDoc[]): string[] {
  const count = new Map<string, number>();
  for (const d of docs) for (const t of d.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** What "Continue reading" offers: opened and started, not finished, most recent first. */
export function continueReading(docs: readonly ReaderDoc[], limit = 3): ReaderDoc[] {
  return sortLibrary(docs.filter((d) => d.lastOpenedAt !== null && d.progress !== null && d.progress.percent < 100)).slice(0, limit);
}

/** The library with one document's progress laid over, kept only if newer (V41). */
export function withProgress(payload: ReaderPayload, documentId: string, p: Progress): ReaderPayload {
  const target = payload.documents.find((d) => d.id === documentId);
  if (!target || !isNewer(p, target.progress)) return payload;
  const moved = { ...target, progress: p, lastOpenedAt: Math.max(target.lastOpenedAt ?? 0, p.at) };
  return { ...payload, documents: payload.documents.map((d) => (d === target ? moved : d)) };
}

export function upsertDoc(payload: ReaderPayload, doc: ReaderDoc): ReaderPayload {
  const known = payload.documents.some((d) => d.id === doc.id);
  return { ...payload, documents: known ? payload.documents.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...payload.documents] };
}

export function upsertCollection(payload: ReaderPayload, c: Collection): ReaderPayload {
  const known = payload.collections.some((x) => x.id === c.id);
  const collections = known ? payload.collections.map((x) => (x.id === c.id ? c : x)) : [...payload.collections, c];
  return { ...payload, collections: collections.sort((a, b) => a.name.localeCompare(b.name)) };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${String(Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** What POST /api/reader/progress answers. `stale`: the server holds a newer position, sent back. */
export type ProgressReply = { ok: true; kind: "saved" | "stale"; progress: Progress } | { ok: false; reason: "demo" | "invalid" | "gone" | "failed" };
