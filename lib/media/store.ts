import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaItem, playbackState } from "@/lib/db/schema";
import { LIBRARY_LIMIT, type ItemCreate, type PlaybackWrite } from "./media";
import type { MediaItem, MediaKind, MediaMeta, MediaProgress, MediaSourceKind } from "./types";

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
  watchLaterAt: mediaItem.watchLaterAt,
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
  watchLaterAt: Date | null;
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

type ProgressRow = { itemId: string; positionS: number; watched: boolean; lastPlayedAt: Date };

const PROGRESS_COLUMNS = {
  itemId: playbackState.itemId,
  positionS: playbackState.positionS,
  watched: playbackState.watched,
  lastPlayedAt: playbackState.lastPlayedAt,
};

function toProgress(p: ProgressRow | undefined): MediaProgress | null {
  return p ? { positionS: p.positionS, watched: p.watched, lastPlayedAt: p.lastPlayedAt.toISOString() } : null;
}

function toItem(r: Row, progress?: ProgressRow): MediaItem {
  return {
    id: r.id,
    kind: r.kind as MediaKind,
    source: r.source as MediaSourceKind,
    fp: r.fp,
    uri: r.uri,
    title: r.title,
    durationS: r.durationS,
    meta: toMeta(r.meta),
    watchLaterAt: r.watchLaterAt?.toISOString() ?? null,
    progress: toProgress(progress),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The owner's media library, newest first. A failed read is reported, never thrown. */
export async function loadMedia(userId: string): Promise<LoadedMedia> {
  const db = getDb();
  if (!db) return { kind: "loaded", items: [] };
  try {
    const [rows, progress] = await db.batch([
      db.select(COLUMNS).from(mediaItem).where(eq(mediaItem.userId, userId)).orderBy(desc(mediaItem.createdAt)).limit(LIBRARY_LIMIT),
      db.select(PROGRESS_COLUMNS).from(playbackState).where(eq(playbackState.userId, userId)),
    ]);
    const of = new Map(progress.map((p) => [p.itemId, p]));
    return { kind: "loaded", items: rows.map((r) => toItem(r, of.get(r.id))) };
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
  // A relink keeps the place it was left at (V54).
  const [progress] = await db
    .select(PROGRESS_COLUMNS)
    .from(playbackState)
    .where(and(eq(playbackState.itemId, row.id), eq(playbackState.userId, userId)))
    .limit(1);
  return { kind: row.id === w.id ? "created" : "existing", item: toItem(row, progress) };
}

export type PlaybackOutcome = { kind: "saved" | "stale"; progress: MediaProgress } | { kind: "gone" };

/**
 * Saves where an item was left (V55). Newer `at` wins, so a late beacon from
 * another device never rolls a newer place back. Only ever the owner's row.
 */
export async function savePlayback(userId: string, w: PlaybackWrite, now = Date.now()): Promise<PlaybackOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [owned] = await db
    .select({ id: mediaItem.id })
    .from(mediaItem)
    .where(and(eq(mediaItem.id, w.itemId), eq(mediaItem.userId, userId)))
    .limit(1);
  if (!owned) return { kind: "gone" };
  const at = new Date(Math.min(w.at, now + 60_000));
  const [landed] = await db
    .insert(playbackState)
    .values({ itemId: w.itemId, userId, positionS: w.positionS, watched: w.watched, lastPlayedAt: at })
    .onConflictDoUpdate({
      target: playbackState.itemId,
      set: { positionS: w.positionS, watched: w.watched, lastPlayedAt: at, updatedAt: sql`now()` },
      setWhere: sql`${playbackState.userId} = ${userId} and ${playbackState.lastPlayedAt} < excluded.last_played_at`,
    })
    .returning(PROGRESS_COLUMNS);
  if (landed) return { kind: "saved", progress: toProgress(landed) as MediaProgress };
  const [current] = await db
    .select(PROGRESS_COLUMNS)
    .from(playbackState)
    .where(and(eq(playbackState.itemId, w.itemId), eq(playbackState.userId, userId)))
    .limit(1);
  return current ? { kind: "stale", progress: toProgress(current) as MediaProgress } : { kind: "gone" };
}

/** Puts an item on the watch-later queue (now) or takes it off (null). */
export async function setWatchLater(userId: string, id: string, on: boolean): Promise<MediaItem | "gone" | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .update(mediaItem)
    .set({ watchLaterAt: on ? sql`coalesce(${mediaItem.watchLaterAt}, now())` : null, updatedAt: sql`now()` })
    .where(and(eq(mediaItem.id, id), eq(mediaItem.userId, userId)))
    .returning(COLUMNS);
  return row ? toItem(row) : "gone";
}

/** Deletes one of the owner's items and its playback state. One already gone is fine. */
export async function deleteItem(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(mediaItem).where(and(eq(mediaItem.id, id), eq(mediaItem.userId, userId)));
  return true;
}
