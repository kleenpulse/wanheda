import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notification } from "@/lib/db/schema";
import { NOTICE_LIMIT, isNotificationKind, type NewNotice, type Notice } from "./notifications";

// Notification persistence. Callers pass the owner's id from requireOwner(),
// never a client-sent one (SPEC V7).

export type LoadedNotices = { kind: "loaded"; notices: Notice[] } | { kind: "failed"; notices: Notice[] };

type Row = typeof notification.$inferSelect;

function toNotice(r: Row): Notice | null {
  if (!isNotificationKind(r.kind)) return null;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    href: r.href,
    dedupeKey: r.dedupeKey,
    createdAt: r.createdAt.getTime(),
    readAt: r.readAt ? r.readAt.getTime() : null,
  };
}

/** The newest notices. A failed read is reported (the centre says so), never thrown. */
export async function loadNotices(userId: string): Promise<LoadedNotices> {
  const db = getDb();
  if (!db) return { kind: "loaded", notices: [] };
  try {
    const rows = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(NOTICE_LIMIT);
    return { kind: "loaded", notices: rows.flatMap((r) => toNotice(r) ?? []) };
  } catch (error) {
    console.error("loadNotices failed", error);
    return { kind: "failed", notices: [] };
  }
}

/** Inserts an alert once per dedupe key; returns it, or the one already there. */
export async function addNotice(userId: string, n: NewNotice): Promise<Notice | null> {
  const db = getDb();
  if (!db) return null;
  const [inserted] = await db
    .insert(notification)
    .values({ userId, ...n })
    .onConflictDoNothing({ target: [notification.userId, notification.dedupeKey] })
    .returning();
  if (inserted) return toNotice(inserted);
  const [existing] = await db
    .select()
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.dedupeKey, n.dedupeKey)))
    .limit(1);
  return existing ? toNotice(existing) : null;
}

/**
 * Inserts several alerts, each once per dedupe key, and returns all of them:
 * the new rows and the ones already there (read or not). Two reads at most.
 */
export async function addNotices(userId: string, list: readonly NewNotice[]): Promise<Notice[]> {
  const db = getDb();
  if (!db || list.length === 0) return [];
  await db
    .insert(notification)
    .values(list.map((n) => ({ userId, ...n })))
    .onConflictDoNothing({ target: [notification.userId, notification.dedupeKey] });
  const rows = await db
    .select()
    .from(notification)
    .where(and(eq(notification.userId, userId), inArray(notification.dedupeKey, list.map((n) => n.dedupeKey))));
  return rows.flatMap((r) => toNotice(r) ?? []);
}

/** Marks the given ids, or every unread one, read now. */
export async function markNoticesRead(userId: string, ids: readonly string[] | "all"): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const owned = eq(notification.userId, userId);
  const which = ids === "all" ? owned : and(owned, inArray(notification.id, [...ids]));
  await db.update(notification).set({ readAt: new Date() }).where(and(which, isNull(notification.readAt)));
  return true;
}
