import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaItem } from "@/lib/db/schema";
import { LIBRARY_LIMIT, type ItemCreate } from "./media";
import type { MediaItem, MediaKind, MediaMeta, MediaSourceKind } from "./types";

// Media persistence (T61). Callers pass the owner's id from requireOwner(),
// never a client-sent one (SPEC V7). Metadata only: a local file's bytes never
// reach the server (V54, V38).

export type LoadedMedia = { kind: "loaded"; items: MediaItem[] } | { kind: "failed" };

const COLUMNS = {
  id: mediaItem.id,
  kind: mediaItem.kind,
  source: mediaItem.source,
  fp: mediaItem.fp,
  uri: mediaItem.uri,
  title: mediaItem.title,
  durationS: mediaItem.durationS,
  meta: mediaItem.meta,
  createdAt: mediaItem.createdAt,
  updatedAt: mediaItem.updatedAt,
};

type Row = {
  id: string;
  kind: string;
  source: string;
  fp: string;
  uri: string;
  title: string;
  durationS: number | null;
  meta: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function toMeta(raw: unknown): MediaMeta {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  return {
    ...(typeof r.size === "number" ? { size: r.size } : {}),
    ...(typeof r.format === "string" ? { format: r.format } : {}),
    ...(typeof r.provider === "string" ? { provider: r.provider } : {}),
  };
}

function toItem(r: Row): MediaItem {
  return {
    id: r.id,
    kind: r.kind as MediaKind,
    source: r.source as MediaSourceKind,
    fp: r.fp,
    uri: r.uri,
    title: r.title,
    durationS: r.durationS,
    meta: toMeta(r.meta),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The owner's media library, newest first. A failed read is reported, never thrown. */
export async function loadMedia(userId: string): Promise<LoadedMedia> {
  const db = getDb();
  if (!db) return { kind: "loaded", items: [] };
  try {
    const rows = await db.select(COLUMNS).from(mediaItem).where(eq(mediaItem.userId, userId)).orderBy(desc(mediaItem.createdAt)).limit(LIBRARY_LIMIT);
    return { kind: "loaded", items: rows.map(toItem) };
  } catch (error) {
    console.error("loadMedia failed", error);
    return { kind: "failed" };
  }
}

export type CreateOutcome = { kind: "created" | "existing"; item: MediaItem } | { kind: "not-yours" };

/**
 * Adds an item by its fp (V54). The same file, link or embed again, from any
 * device, returns the row it already has (a relink); a replay of the same
 * create is the same row. An id another user holds is refused.
 */
export async function createItem(userId: string, w: ItemCreate): Promise<CreateOutcome | null> {
  const db = getDb();
  if (!db) return null;
  await db
    .insert(mediaItem)
    .values({ id: w.id, userId, kind: w.kind, source: w.source, fp: w.fp, uri: w.uri, title: w.title, durationS: w.durationS, meta: w.meta })
    .onConflictDoNothing();
  const [row] = await db
    .select(COLUMNS)
    .from(mediaItem)
    .where(and(eq(mediaItem.userId, userId), eq(mediaItem.fp, w.fp)))
    .limit(1);
  if (!row) return { kind: "not-yours" };
  return { kind: row.id === w.id ? "created" : "existing", item: toItem(row) };
}

/** Deletes one of the owner's items and its playback state. One already gone is fine. */
export async function deleteItem(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(mediaItem).where(and(eq(mediaItem.id, id), eq(mediaItem.userId, userId)));
  return true;
}
