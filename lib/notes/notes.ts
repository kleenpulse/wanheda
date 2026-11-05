import { z } from "zod";

// Sticky notes, the pure part (FR-NOTES-1..7): the shapes, input checks,
// checklists, quick capture, local search and the conflict rule (SPEC V23).
// The server store, the actions and the client all share it.

/** Sticky colours. The board's data palette maps them to tokens (T31). Stored, so never rename one. */
export const NOTE_COLORS = ["plain", "amber", "rose", "sky", "mint", "violet"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const TITLE_MAX = 200;
export const BODY_MAX = 100_000;
export const TAGS_MAX = 20;
export const TAG_MAX = 32;

/** What the owner writes. A write replaces all of it at once. */
export interface NoteContent {
  title: string;
  bodyMd: string;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  tags: string[];
}

export interface Note extends NoteContent {
  id: string;
  /** Accepted writes so far; 0 for a note the server hasn't seen yet. */
  version: number;
  /** Client clock at the last edit, ms. Settles conflicts. */
  editedAt: number;
  createdAt: number;
  updatedAt: number;
}

/** One write as sent to the server: the whole content, the version it was made on, and when. */
export interface NoteWrite extends NoteContent {
  id: string;
  baseVersion: number;
  editedAt: number;
}

/** Lowercased, trimmed, deduplicated, order kept. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export const noteWriteSchema = z
  .object({
    id: z.uuid(),
    title: z.string().max(TITLE_MAX),
    bodyMd: z.string().max(BODY_MAX),
    color: z.enum(NOTE_COLORS),
    pinned: z.boolean(),
    archived: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(TAG_MAX)).max(TAGS_MAX).transform(normalizeTags),
    baseVersion: z.number().int().min(0),
    // 2020-01-01 or later: a zero or garbage clock would lose every conflict.
    editedAt: z.number().int().min(1_577_836_800_000),
  })
  .strict();

/** Ms of skew allowed on a write's clock. Later than this is pulled back to the server's now. */
export const CLOCK_SKEW_MS = 60_000;

/**
 * A device whose clock runs ahead would win every conflict forever, so a
 * write stamped in the future is pulled back to the server's now.
 */
export function clampEditedAt(editedAt: number, now: number): number {
  return editedAt > now + CLOCK_SKEW_MS ? now : editedAt;
}

export const EMPTY_CONTENT: NoteContent = {
  title: "",
  bodyMd: "",
  color: "plain",
  pinned: false,
  archived: false,
  tags: [],
};

/** A note the server hasn't seen yet. */
export function draftNote(id: string, now: number, content: Partial<NoteContent> = {}): Note {
  return { ...EMPTY_CONTENT, ...content, id, version: 0, editedAt: now, createdAt: now, updatedAt: now };
}

export function contentOf(n: NoteContent): NoteContent {
  return {
    title: n.title,
    bodyMd: n.bodyMd,
    color: n.color,
    pinned: n.pinned,
    archived: n.archived,
    tags: [...n.tags],
  };
}

export function sameContent(a: NoteContent, b: NoteContent): boolean {
  return (
    a.title === b.title &&
    a.bodyMd === b.bodyMd &&
    a.color === b.color &&
    a.pinned === b.pinned &&
    a.archived === b.archived &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  );
}

export function writeOf(n: Note, baseVersion: number = n.version): NoteWrite {
  return { ...contentOf(n), id: n.id, baseVersion, editedAt: n.editedAt };
}

/**
 * What the server does with a write (SPEC V23):
 * - no row: insert it (a new note, or one deleted elsewhere: the edit brings it back);
 * - made on the current version: apply it, unless it changes nothing;
 * - made on an older version with the same content: a replay, nothing to do;
 * - otherwise a conflict: the later `editedAt` wins, the server row on a tie,
 *   and the loser goes to `note_revision`.
 */
export type Resolution =
  | { kind: "insert" }
  | { kind: "update" }
  | { kind: "noop" }
  | { kind: "conflict"; winner: "incoming" | "server" };

export function resolveWrite(current: Note | null, write: NoteWrite): Resolution {
  if (!current) return { kind: "insert" };
  if (sameContent(current, write)) return { kind: "noop" };
  if (current.version === write.baseVersion) return { kind: "update" };
  return { kind: "conflict", winner: write.editedAt > current.editedAt ? "incoming" : "server" };
}

/** Pinned first, then the most recently edited. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.editedAt - a.editedAt || a.id.localeCompare(b.id));
}

// ---- Markdown helpers --------------------------------------------------------

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
// A GFM task item, optionally inside blockquotes: `- [ ] buy`, `1. [x] done`, `> * [ ] x`.
const TASK = /^((?:\s*>)*\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\]\s)/;

interface TaskLine {
  /** 1-based, as the Markdown parser reports positions. */
  line: number;
  checked: boolean;
}

/** Every task item outside fenced code, in document order. */
export function taskLines(body: string): TaskLine[] {
  const out: TaskLine[] = [];
  let fence: string | null = null;
  body.split("\n").forEach((text, i) => {
    const f = FENCE.exec(text);
    if (f?.[1]) {
      const marker = f[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return;
    }
    if (fence !== null) return;
    const m = TASK.exec(`${text} `);
    if (m) out.push({ line: i + 1, checked: m[2] !== " " });
  });
  return out;
}

/** "2 of 5 done" on the sticky (FR-NOTES-5), or null without a checklist. */
export function checklistProgress(body: string): { done: number; total: number } | null {
  const tasks = taskLines(body);
  if (tasks.length === 0) return null;
  return { done: tasks.filter((t) => t.checked).length, total: tasks.length };
}

/** Ticks or unticks the task item on `line` (1-based). Any other line leaves the body as is. */
export function toggleTaskAtLine(body: string, line: number): string {
  if (!taskLines(body).some((t) => t.line === line)) return body;
  const lines = body.split("\n");
  const text = lines[line - 1];
  if (text === undefined) return body;
  lines[line - 1] = `${text} `.replace(TASK, (_all, pre: string, mark: string, post: string) => `${pre}${mark === " " ? "x" : " "}${post}`).slice(0, -1);
  return lines.join("\n");
}

/** One line of Markdown as plain text, for titles and excerpts. */
function plainLine(text: string): string {
  return text
    .replace(/^(?:\s*>)*\s*/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .trim();
}

function bodyLines(body: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const raw of body.split("\n")) {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    const text = fenced ? raw.trim() : plainLine(raw);
    if (text) out.push(text);
  }
  return out;
}

/** The note's title, or its first line, or "Untitled". */
export function displayTitle(n: Pick<NoteContent, "title" | "bodyMd">): string {
  const title = n.title.trim();
  if (title) return title;
  const first = bodyLines(n.bodyMd)[0];
  if (!first) return "Untitled";
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

/** Plain text after the title line, for cards and search results. */
export function excerpt(n: Pick<NoteContent, "title" | "bodyMd">, max = 160): string {
  const lines = bodyLines(n.bodyMd);
  const rest = n.title.trim() ? lines : lines.slice(1);
  const text = rest.join(" · ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ---- Quick capture and search ------------------------------------------------

/** "note buy SSD" in the palette → "buy SSD" (FR-NOTES-3). Anything else → null. */
export function parseCapture(query: string): string | null {
  const m = /^\s*note\s+(\S[\s\S]*)$/i.exec(query);
  const text = m?.[1]?.trim();
  return text ? text.slice(0, BODY_MAX) : null;
}

const MAX_TERMS = 8;

/** The words of a query, lowercased: letters and digits only, so they are safe in a tsquery. */
export function searchTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.map((w) => w.slice(0, 64)))].slice(0, MAX_TERMS);
}

/** `buy:* & ssd:*` for `to_tsquery('simple', …)`: every word, each as a prefix. Null when there are none. */
export function prefixTsQuery(query: string): string | null {
  const terms = searchTerms(query);
  return terms.length ? terms.map((t) => `${t}:*`).join(" & ") : null;
}

/** Below this ts_rank a match is noise (SPEC V17: search has a score floor). */
export const SEARCH_FLOOR = 0.001;
export const SEARCH_LIMIT = 8;

/**
 * The same search in memory, for demo mode and (later) offline: every word
 * must start some word of the note; title hits rank above body hits. Archived
 * notes are left out, as on the server.
 */
export function searchLocal(notes: readonly Note[], query: string, limit = SEARCH_LIMIT): Note[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const scored: { note: Note; score: number }[] = [];
  for (const n of notes) {
    if (n.archived) continue;
    const titleWords = n.title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const bodyWords = n.bodyMd.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    let score = 0;
    for (const t of terms) {
      const inTitle = titleWords.some((w) => w.startsWith(t));
      const inBody = bodyWords.some((w) => w.startsWith(t));
      if (!inTitle && !inBody) {
        score = 0;
        break;
      }
      score += inTitle ? 2 : 1;
    }
    if (score > 0) scored.push({ note: n, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.note.editedAt - a.note.editedAt)
    .slice(0, limit)
    .map((s) => s.note);
}

/** A search hit as the palette shows it. */
export interface NoteHit {
  id: string;
  title: string;
  snippet: string;
}

export function hitOf(n: Note): NoteHit {
  return { id: n.id, title: displayTitle(n), snippet: excerpt(n, 90) };
}

// ---- Wire shapes ----------------------------------------------------------------

/** owner: the database. demo: seed notes, never saved. load-failed: the list could not be read. */
export type NotesSource = "owner" | "demo" | "load-failed";

/** What the notes page prefetches and GET /api/notes returns. */
export interface NotesPayload {
  source: NotesSource;
  notes: Note[];
}

/** TanStack Query key of the notes list, shared by the server prefetch and the client. */
export const NOTES_KEY = ["notes"] as const;
