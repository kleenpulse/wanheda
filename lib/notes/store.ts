import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { note, noteRevision } from "@/lib/db/schema";
import {
  NOTE_COLORS,
  SEARCH_FLOOR,
  SEARCH_LIMIT,
  clampEditedAt,
  contentOf,
  prefixTsQuery,
  type NoteRevision,
  resolveWrite,
  type Note,
  type NoteColor,
  type NoteContent,
  type NoteWrite,
} from "./notes";

// Note persistence. Callers pass the owner's id from requireOwner(), never a
// client-sent one (SPEC V7). Every write goes through saveNote, which applies
// the conflict rule (SPEC V23); pin, archive and colour are writes too.

export const NOTE_LIST_LIMIT = 1000;

export type LoadedNotes = { kind: "loaded"; notes: Note[] } | { kind: "failed"; notes: Note[] };

/** `won` only on a conflict: whether this write is now the note (true) or went to history (false). */
export type SaveOutcome =
  | { kind: "saved"; note: Note }
  | { kind: "unchanged"; note: Note }
  | { kind: "conflict"; note: Note; won: boolean }
  | { kind: "not-yours" };

type Row = Omit<typeof note.$inferSelect, "search">;

function isColor(value: string): value is NoteColor {
  return (NOTE_COLORS as readonly string[]).includes(value);
}

function toNote(r: Row): Note {
  return {
    id: r.id,
    title: r.title,
    bodyMd: r.bodyMd,
    color: isColor(r.color) ? r.color : "plain",
    pinned: r.pinned,
    archived: r.archived,
    tags: r.tags,
    version: r.version,
    editedAt: r.editedAt.getTime(),
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

// Everything but the generated search column, which can be large.
const NOTE_COLUMNS = {
  id: note.id,
  userId: note.userId,
  title: note.title,
  bodyMd: note.bodyMd,
  color: note.color,
  pinned: note.pinned,
  archived: note.archived,
  tags: note.tags,
  boardX: note.boardX,
  boardY: note.boardY,
  boardW: note.boardW,
  boardH: note.boardH,
  remindAt: note.remindAt,
  version: note.version,
  editedAt: note.editedAt,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
};

/** All the owner's notes, archived included. A failed read is reported, never thrown. */
export async function listNotes(userId: string): Promise<LoadedNotes> {
  const db = getDb();
  if (!db) return { kind: "loaded", notes: [] };
  try {
    const rows = await db
      .select(NOTE_COLUMNS)
      .from(note)
      .where(eq(note.userId, userId))
      .orderBy(desc(note.updatedAt))
      .limit(NOTE_LIST_LIMIT);
    return { kind: "loaded", notes: rows.map((r) => toNote(r)) };
  } catch (error) {
    console.error("listNotes failed", error);
    return { kind: "failed", notes: [] };
  }
}

const ATTEMPTS = 3;

/**
 * Applies one write by SPEC V23. Each step is conditional on the version it
 * read, so a write racing in between makes it read again (up to 3 times)
 * instead of overwriting blind.
 */
export async function saveNote(userId: string, input: NoteWrite, now = Date.now()): Promise<SaveOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const write: NoteWrite = { ...input, editedAt: clampEditedAt(input.editedAt, now) };
  const content = contentOf(write);
  const editedAt = new Date(write.editedAt);

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // By id alone: an id that belongs to someone else must be refused, not "inserted" into a conflict.
    const [row] = await db.select(NOTE_COLUMNS).from(note).where(eq(note.id, write.id)).limit(1);
    if (row && row.userId !== userId) return { kind: "not-yours" };
    const current = row ? toNote(row) : null;
    const resolution = resolveWrite(current, write);

    switch (resolution.kind) {
      case "noop":
        if (current) return { kind: "unchanged", note: current };
        break;

      case "insert": {
        const [inserted] = await db
          .insert(note)
          .values({ ...content, id: write.id, userId, version: 1, editedAt })
          .onConflictDoNothing({ target: note.id })
          .returning();
        if (inserted) return { kind: "saved", note: toNote(inserted) };
        break;
      }

      case "update": {
        if (!current) break;
        if (write.keepCurrent) {
          // A restore from history: the version it replaces joins the history.
          const updated = await replaceKeepingHistory(userId, current, content, editedAt);
          if (updated) return { kind: "saved", note: updated };
          break;
        }
        const [updated] = await db
          .update(note)
          .set({ ...content, version: current.version + 1, editedAt })
          .where(and(eq(note.id, write.id), eq(note.userId, userId), eq(note.version, current.version)))
          .returning();
        if (updated) return { kind: "saved", note: toNote(updated) };
        break;
      }

      case "conflict": {
        if (!current) break;
        if (resolution.winner === "server") {
          await keepLoser(userId, write);
          return { kind: "conflict", note: current, won: false };
        }
        const updated = await replaceKeepingHistory(userId, current, content, editedAt);
        if (updated) return { kind: "conflict", note: updated, won: true };
        break;
      }
    }
  }
  throw new Error(`saveNote: note ${write.id} kept changing; gave up after ${String(ATTEMPTS)} reads`);
}

/**
 * Copies the row a write replaces into history and applies the write, in one
 * transaction, all keyed on the version read before. The row is locked first:
 * under READ COMMITTED each statement takes a fresh snapshot, so without the
 * lock a write landing between the copy and the update would leave a history
 * row for an update that never happened, and the retry would copy it again.
 * Undefined when the row changed since it was read.
 */
async function replaceKeepingHistory(
  userId: string,
  current: Note,
  content: NoteContent,
  editedAt: Date,
): Promise<Note | undefined> {
  const db = getDb();
  if (!db) return undefined;
  const same = and(eq(note.id, current.id), eq(note.userId, userId), eq(note.version, current.version));
  const [, , updatedRows] = await db.batch([
    db.select({ id: note.id }).from(note).where(same).for("update"),
    db.insert(noteRevision).select(
      db
        .select({
          id: sql<string>`gen_random_uuid()`.as("id"),
          noteId: note.id,
          userId: note.userId,
          title: note.title,
          bodyMd: note.bodyMd,
          editedAt: note.editedAt,
          replacedAt: sql<Date>`now()`.as("replaced_at"),
        })
        .from(note)
        .where(same),
    ),
    db
      .update(note)
      .set({ ...content, version: current.version + 1, editedAt })
      .where(same)
      .returning(),
  ]);
  const [updated] = updatedRows;
  return updated ? toNote(updated) : undefined;
}

/** A late write that lost goes to history once, however often the outbox replays it. */
async function keepLoser(userId: string, write: NoteWrite): Promise<void> {
  const db = getDb();
  if (!db) return;
  const editedAt = new Date(write.editedAt);
  const [already] = await db
    .select({ id: noteRevision.id })
    .from(noteRevision)
    .where(
      and(
        eq(noteRevision.noteId, write.id),
        eq(noteRevision.userId, userId),
        eq(noteRevision.editedAt, editedAt),
        eq(noteRevision.title, write.title),
        eq(noteRevision.bodyMd, write.bodyMd),
      ),
    )
    .limit(1);
  if (already) return;
  await db.insert(noteRevision).values({ noteId: write.id, userId, title: write.title, bodyMd: write.bodyMd, editedAt });
}

/**
 * Deletes a note for good, archived ones only (the list offers it from the
 * archive). Null without a database. False when there was nothing to delete:
 * already gone, or brought back out of the archive on another device. Both
 * are final, so the outbox drops the op either way.
 */
export async function deleteNote(userId: string, id: string): Promise<boolean | null> {
  const db = getDb();
  if (!db) return null;
  const gone = await db
    .delete(note)
    .where(and(eq(note.id, id), eq(note.userId, userId), eq(note.archived, true)))
    .returning({ id: note.id });
  return gone.length > 0;
}

export const REVISION_LIMIT = 50;

/** A note's history, newest first: what conflicts replaced or turned away (FR-NOTES-4). Null when the read failed. */
export async function listRevisions(userId: string, noteId: string): Promise<NoteRevision[] | null> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: noteRevision.id,
        title: noteRevision.title,
        bodyMd: noteRevision.bodyMd,
        editedAt: noteRevision.editedAt,
        replacedAt: noteRevision.replacedAt,
      })
      .from(noteRevision)
      .where(and(eq(noteRevision.noteId, noteId), eq(noteRevision.userId, userId)))
      .orderBy(desc(noteRevision.replacedAt))
      .limit(REVISION_LIMIT);
    return rows.map((r) => ({ ...r, editedAt: r.editedAt.getTime(), replacedAt: r.replacedAt.getTime() }));
  } catch (error) {
    console.error("listRevisions failed", error);
    return null;
  }
}

/**
 * Full-text search over titles and bodies (FR-NOTES-7): every word as a
 * prefix must match; ranked by how well the words match, with a score floor
 * (SPEC V17). Archived notes are left out.
 * The index is a generated column, so an edit re-indexes itself.
 */
export async function searchNotes(userId: string, query: string): Promise<Note[] | null> {
  const db = getDb();
  if (!db) return [];
  const tsquery = prefixTsQuery(query);
  const anyTerm = prefixTsQuery(query, "any");
  if (!tsquery || !anyTerm) return [];
  try {
    const q = sql`to_tsquery('simple', ${tsquery})`;
    // Ranked against "any word", matched against "every word". ts_rank on an
    // AND query falls towards zero as the words drift apart in the note, so a
    // title word plus a word deep in the body would sink under the floor.
    const rank = sql<number>`ts_rank(${note.search}, to_tsquery('simple', ${anyTerm}))`;
    const rows = await db
      .select(NOTE_COLUMNS)
      .from(note)
      .where(and(eq(note.userId, userId), eq(note.archived, false), sql`${note.search} @@ ${q}`, sql`${rank} >= ${SEARCH_FLOOR}`))
      .orderBy(desc(rank), desc(note.editedAt))
      .limit(SEARCH_LIMIT);
    return rows.map((r) => toNote(r));
  } catch (error) {
    console.error("searchNotes failed", error);
    return null;
  }
}
