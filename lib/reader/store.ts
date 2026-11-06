import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { collection, document, documentCollection, readingProgress } from "@/lib/db/schema";
import {
  DOC_KINDS,
  READING_MODES,
  clampAt,
  type Collection,
  type CollectionWrite,
  type DocKind,
  type DocumentCreate,
  type DocumentPatch,
  type Progress,
  type ProgressWrite,
  type ReaderDoc,
  type ReadingMode,
} from "./reader";

// Reader persistence (T46). Callers pass the owner's id from requireOwner(),
// never a client-sent one (SPEC V7). No function here takes or returns file
// bytes: local-only means the server only ever sees metadata (V38).

export const LIBRARY_LIMIT = 2000;

export type LoadedLibrary = { kind: "loaded"; documents: ReaderDoc[]; collections: Collection[] } | { kind: "failed" };

const DOC_COLUMNS = {
  id: document.id,
  kind: document.kind,
  title: document.title,
  author: document.author,
  fileName: document.fileName,
  sha256: document.sha256,
  sizeBytes: document.sizeBytes,
  pages: document.pages,
  tags: document.tags,
  mode: document.mode,
  lastOpenedAt: document.lastOpenedAt,
  createdAt: document.createdAt,
};

type DocRow = Pick<typeof document.$inferSelect, keyof typeof DOC_COLUMNS>;
type ProgressRow = { documentId: string; locator: string; percent: number; at: Date };

function isKind(v: string): v is DocKind {
  return (DOC_KINDS as readonly string[]).includes(v);
}

function isMode(v: string): v is ReadingMode {
  return (READING_MODES as readonly string[]).includes(v);
}

function toProgress(p: ProgressRow): Progress {
  return { locator: p.locator, percent: p.percent, at: p.at.getTime() };
}

function toDoc(r: DocRow, collections: string[], progress: ProgressRow | undefined): ReaderDoc | null {
  if (!isKind(r.kind)) return null;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    author: r.author,
    fileName: r.fileName,
    sha256: r.sha256,
    sizeBytes: r.sizeBytes,
    pages: r.pages,
    tags: r.tags,
    mode: isMode(r.mode) ? r.mode : "scroll",
    collections: [...collections].sort(),
    progress: progress ? toProgress(progress) : null,
    lastOpenedAt: r.lastOpenedAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
  };
}

const PROGRESS_COLUMNS = {
  documentId: readingProgress.documentId,
  locator: readingProgress.locator,
  percent: readingProgress.percent,
  at: readingProgress.at,
};

/** The owner's whole library in one round trip. A failed read is reported, never thrown. */
export async function loadLibrary(userId: string): Promise<LoadedLibrary> {
  const db = getDb();
  if (!db) return { kind: "loaded", documents: [], collections: [] };
  try {
    const [docs, cols, links, progress] = await db.batch([
      db
        .select(DOC_COLUMNS)
        .from(document)
        .where(eq(document.userId, userId))
        .orderBy(sql`${document.lastOpenedAt} desc nulls last`, desc(document.createdAt))
        .limit(LIBRARY_LIMIT),
      db.select({ id: collection.id, name: collection.name }).from(collection).where(eq(collection.userId, userId)).orderBy(collection.name),
      db
        .select({ documentId: documentCollection.documentId, collectionId: documentCollection.collectionId })
        .from(documentCollection)
        .where(eq(documentCollection.userId, userId)),
      db.select(PROGRESS_COLUMNS).from(readingProgress).where(eq(readingProgress.userId, userId)),
    ]);
    const linksOf = new Map<string, string[]>();
    for (const l of links) linksOf.set(l.documentId, [...(linksOf.get(l.documentId) ?? []), l.collectionId]);
    const progressOf = new Map(progress.map((p) => [p.documentId, p]));
    const documents = docs.flatMap((r) => toDoc(r, linksOf.get(r.id) ?? [], progressOf.get(r.id)) ?? []);
    return { kind: "loaded", documents, collections: cols };
  } catch (error) {
    console.error("loadLibrary failed", error);
    return { kind: "failed" };
  }
}

/** One document with its links and progress, or null when it isn't the owner's. */
async function loadDoc(userId: string, id: string): Promise<ReaderDoc | null> {
  const db = getDb();
  if (!db) return null;
  const [docs, links, progress] = await db.batch([
    db
      .select(DOC_COLUMNS)
      .from(document)
      .where(and(eq(document.id, id), eq(document.userId, userId)))
      .limit(1),
    db
      .select({ collectionId: documentCollection.collectionId })
      .from(documentCollection)
      .where(and(eq(documentCollection.documentId, id), eq(documentCollection.userId, userId))),
    db
      .select(PROGRESS_COLUMNS)
      .from(readingProgress)
      .where(and(eq(readingProgress.documentId, id), eq(readingProgress.userId, userId)))
      .limit(1),
  ]);
  const row = docs[0];
  return row
    ? toDoc(
        row,
        links.map((l) => l.collectionId),
        progress[0],
      )
    : null;
}

export type CreateOutcome = { kind: "created" | "existing"; doc: ReaderDoc } | { kind: "not-yours" };

/**
 * Adds a document by its bytes' sha256 (V39). The same file again, from any
 * device, opens the row it already has instead of making a second one; a
 * replay of the same create is the same row. An id another user holds is
 * refused.
 */
export async function createDocument(userId: string, w: DocumentCreate): Promise<CreateOutcome | null> {
  const db = getDb();
  if (!db) return null;
  // No target: either unique key (the id, or user + sha256) turns the insert into nothing.
  await db
    .insert(document)
    .values({
      id: w.id,
      userId,
      kind: w.kind,
      title: w.title,
      author: w.author,
      fileName: w.fileName,
      sha256: w.sha256,
      sizeBytes: w.sizeBytes,
      pages: w.pages,
      tags: w.tags,
    })
    .onConflictDoNothing();
  const [held] = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.userId, userId), eq(document.sha256, w.sha256)))
    .limit(1);
  if (!held) return { kind: "not-yours" };
  const doc = await loadDoc(userId, held.id);
  if (!doc) return { kind: "not-yours" };
  return { kind: held.id === w.id ? "created" : "existing", doc };
}

export type PatchOutcome = { kind: "saved"; doc: ReaderDoc } | { kind: "gone" } | { kind: "not-yours" };

/** Edits metadata; collections, when given, replace the document's set in the same transaction. */
export async function updateDocument(userId: string, p: DocumentPatch): Promise<PatchOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [owned] = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.id, p.id), eq(document.userId, userId)))
    .limit(1);
  if (!owned) return { kind: "gone" };
  const wanted = p.collections ? [...new Set(p.collections)] : null;
  if (wanted && wanted.length > 0) {
    const mine = await db
      .select({ id: collection.id })
      .from(collection)
      .where(and(eq(collection.userId, userId), inArray(collection.id, wanted)));
    if (mine.length !== wanted.length) return { kind: "not-yours" };
  }
  const set = {
    ...(p.title === undefined ? {} : { title: p.title }),
    ...(p.author === undefined ? {} : { author: p.author || null }),
    ...(p.tags === undefined ? {} : { tags: p.tags }),
    ...(p.mode === undefined ? {} : { mode: p.mode }),
  };
  const same = and(eq(document.id, p.id), eq(document.userId, userId));
  const update = db
    .update(document)
    .set({ ...set, updatedAt: sql`now()` })
    .where(same);
  if (wanted) {
    const unlink = db.delete(documentCollection).where(and(eq(documentCollection.documentId, p.id), eq(documentCollection.userId, userId)));
    if (wanted.length > 0) {
      await db.batch([
        update,
        unlink,
        db.insert(documentCollection).values(wanted.map((collectionId) => ({ documentId: p.id, collectionId, userId }))),
      ]);
    } else {
      await db.batch([update, unlink]);
    }
  } else {
    await update;
  }
  const doc = await loadDoc(userId, p.id);
  return doc ? { kind: "saved", doc } : { kind: "gone" };
}

/** Deletes one of the owner's documents; its links, progress and highlights go with it. One already gone is fine. */
export async function deleteDocument(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(document).where(and(eq(document.id, id), eq(document.userId, userId)));
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? e.code : undefined);
  return code(error) === "23505" || (typeof error === "object" && error !== null && "cause" in error && code(error.cause) === "23505");
}

export type CollectionOutcome = { kind: "saved"; collection: Collection } | { kind: "not-yours" } | { kind: "taken" };

/** Creates or renames a collection by its client id. A name already in use is `taken`. */
export async function saveCollection(userId: string, w: CollectionWrite): Promise<CollectionOutcome | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .insert(collection)
      .values({ id: w.id, userId, name: w.name })
      .onConflictDoUpdate({ target: collection.id, set: { name: w.name, updatedAt: sql`now()` }, setWhere: eq(collection.userId, userId) })
      .returning({ id: collection.id, name: collection.name });
    return row ? { kind: "saved", collection: row } : { kind: "not-yours" };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "taken" };
    throw error;
  }
}

/** Deletes a collection; its documents stay, only the links go. */
export async function deleteCollection(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(collection).where(and(eq(collection.id, id), eq(collection.userId, userId)));
  return true;
}

export type ProgressOutcome = { kind: "saved" | "stale"; progress: Progress } | { kind: "gone" };

/**
 * Records a reading position by V41: it lands only over an older `at`, so a
 * stale tab or device never drags a newer position back. Opening counts as
 * reading, so it moves the document's last-opened time forward too.
 */
export async function saveProgress(userId: string, w: ProgressWrite, now = Date.now()): Promise<ProgressOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const at = new Date(clampAt(w.at, now));
  const [owned] = await db
    .update(document)
    .set({ lastOpenedAt: sql`greatest(${document.lastOpenedAt}, ${at.toISOString()}::timestamptz)` })
    .where(and(eq(document.id, w.documentId), eq(document.userId, userId)))
    .returning({ id: document.id });
  if (!owned) return { kind: "gone" };
  const [landed] = await db
    .insert(readingProgress)
    .values({ documentId: w.documentId, userId, locator: w.locator, percent: w.percent, at })
    .onConflictDoUpdate({
      target: readingProgress.documentId,
      set: { locator: w.locator, percent: w.percent, at, updatedAt: sql`now()` },
      // Newer wins, and only ever on the owner's own row.
      setWhere: sql`${readingProgress.userId} = ${userId} and ${readingProgress.at} < excluded.at`,
    })
    .returning(PROGRESS_COLUMNS);
  if (landed) return { kind: "saved", progress: toProgress(landed) };
  const [current] = await db
    .select(PROGRESS_COLUMNS)
    .from(readingProgress)
    .where(and(eq(readingProgress.documentId, w.documentId), eq(readingProgress.userId, userId)))
    .limit(1);
  return current ? { kind: "stale", progress: toProgress(current) } : { kind: "gone" };
}
