import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userPrefs } from "@/lib/db/schema";
import { parseReaderPrefs, type ReaderPrefs } from "@/lib/reader/prefs";
import { DEFAULT_PREFS, parsePrefs, type Prefs } from "./prefs";

// Prefs persistence. Callers pass the owner's id from requireOwner(), never a
// client-sent one (SPEC V7).

export type LoadedPrefs =
  /** `reader`: the saved reader prefs, field by field; null when none were ever saved. */
  | { kind: "loaded"; prefs: Prefs; reader: Partial<ReaderPrefs> | null }
  | { kind: "failed"; prefs: null; reader: null };

/**
 * The owner's prefs, defaults when there is no row yet. A failed read
 * (database down, migration not applied) is reported, never thrown, and the
 * shell falls back to the prefs the device's cookie already has (SPEC V9, V17).
 */
export async function loadPrefs(userId: string): Promise<LoadedPrefs> {
  const db = getDb();
  if (!db) return { kind: "loaded", prefs: DEFAULT_PREFS, reader: null };
  try {
    const [row] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
    if (!row) return { kind: "loaded", prefs: DEFAULT_PREFS, reader: null };
    return { kind: "loaded", prefs: parsePrefs(row), reader: row.reader == null ? null : parseReaderPrefs(row.reader) };
  } catch (error) {
    console.error("loadPrefs failed", error);
    return { kind: "failed", prefs: null, reader: null };
  }
}

/** Upserts the whole (already validated) prefs row. False when there is no database. */
export async function savePrefs(userId: string, p: Prefs): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const values = {
    skin: p.skin,
    accent: p.accent,
    wallpaper: p.wallpaper,
    timerMode: p.timerMode,
    wallpaperScope: p.wallpaperScope,
    wallpaperCover: p.wallpaperCover,
    wallpaperPages: p.wallpaperPages,
    auroraEdge: p.auroraEdge,
  };
  await db
    .insert(userPrefs)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { ...values, updatedAt: sql`now()` } });
  return true;
}

/** Sets the owner's (already validated) reader prefs, creating the prefs row if there is none. False without a database. */
export async function saveReaderPrefs(userId: string, reader: ReaderPrefs): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db
    .insert(userPrefs)
    .values({ userId, reader })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { reader, updatedAt: sql`now()` } });
  return true;
}

/** Sets the owner's base currency (T38), creating the prefs row if there is none. False without a database. */
export async function saveBaseCurrency(userId: string, currency: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db
    .insert(userPrefs)
    .values({ userId, baseCurrency: currency })
    .onConflictDoUpdate({ target: userPrefs.userId, set: { baseCurrency: currency, updatedAt: sql`now()` } });
  return true;
}
