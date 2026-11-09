import "server-only";
import { count, countDistinct, desc, eq, gt, gte, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { connector, document, mediaItem, note, session, txn, user, userActivity } from "@/lib/db/schema";
import { fillDays, lastDays, type DayCount } from "./series";

// The admin page's numbers (ADR-0015), read in one round trip. Counts and the
// newest sign-ups only: never anyone's notes, money or files.

export const SERIES_DAYS = 30;
const RECENT = 25;

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  /** Last UTC day seen, or null if never seen since tracking began. */
  lastActive: string | null;
}

export interface AppUsage {
  id: "money" | "income" | "notes" | "reader" | "media";
  title: string;
  /** Users with at least one item in the app. */
  users: number;
}

export interface AdminStats {
  asOf: string;
  users: number;
  newWeek: number;
  newMonth: number;
  activeToday: number;
  activeWeek: number;
  activeMonth: number;
  /** Sessions not yet expired: signed-in browsers and desktop apps. */
  liveSessions: number;
  signups: DayCount[];
  active: DayCount[];
  apps: AppUsage[];
  recent: AdminUser[];
}

export type AdminStatsResult = { kind: "loaded"; stats: AdminStats } | { kind: "no-db" } | { kind: "failed" };

const signupDay = sql<string>`to_char(${user.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

export async function loadAdminStats(now: Date = new Date()): Promise<AdminStatsResult> {
  const db = getDb();
  if (!db) return { kind: "no-db" };

  const days = lastDays(now, SERIES_DAYS);
  const [first] = days;
  const today = days.at(-1);
  const week = days.at(-7);
  if (!first || !today || !week) return { kind: "failed" };
  const since = new Date(`${first}T00:00:00Z`);
  const weekStart = new Date(`${week}T00:00:00Z`);

  try {
    const [
      users,
      newWeek,
      newMonth,
      activeToday,
      activeWeek,
      activeMonth,
      live,
      signups,
      active,
      money,
      income,
      notes,
      reader,
      media,
      recent,
    ] = await db.batch([
      db.select({ n: count() }).from(user),
      db.select({ n: count() }).from(user).where(gte(user.createdAt, weekStart)),
      db.select({ n: count() }).from(user).where(gte(user.createdAt, since)),
      db.select({ n: count() }).from(userActivity).where(eq(userActivity.day, today)),
      db.select({ n: countDistinct(userActivity.userId) }).from(userActivity).where(gte(userActivity.day, week)),
      db.select({ n: countDistinct(userActivity.userId) }).from(userActivity).where(gte(userActivity.day, first)),
      db.select({ n: count() }).from(session).where(gt(session.expiresAt, now)),
      db.select({ day: signupDay, count: count() }).from(user).where(gte(user.createdAt, since)).groupBy(signupDay),
      db.select({ day: userActivity.day, count: count() }).from(userActivity).where(gte(userActivity.day, first)).groupBy(userActivity.day),
      db.select({ n: countDistinct(txn.userId) }).from(txn),
      db.select({ n: countDistinct(connector.userId) }).from(connector),
      db.select({ n: countDistinct(note.userId) }).from(note),
      db.select({ n: countDistinct(document.userId) }).from(document),
      db.select({ n: countDistinct(mediaItem.userId) }).from(mediaItem),
      db
        .select({ id: user.id, name: user.name, email: user.email, joinedAt: user.createdAt, lastActive: max(userActivity.day) })
        .from(user)
        .leftJoin(userActivity, eq(userActivity.userId, user.id))
        .groupBy(user.id)
        .orderBy(desc(user.createdAt))
        .limit(RECENT),
    ]);

    const n = (rows: readonly { n: number }[]) => rows[0]?.n ?? 0;
    return {
      kind: "loaded",
      stats: {
        asOf: now.toISOString(),
        users: n(users),
        newWeek: n(newWeek),
        newMonth: n(newMonth),
        activeToday: n(activeToday),
        activeWeek: n(activeWeek),
        activeMonth: n(activeMonth),
        liveSessions: n(live),
        signups: fillDays(days, signups),
        active: fillDays(days, active),
        apps: [
          { id: "money", title: "Money", users: n(money) },
          { id: "income", title: "Income", users: n(income) },
          { id: "notes", title: "Notes", users: n(notes) },
          { id: "reader", title: "Reader", users: n(reader) },
          { id: "media", title: "Media", users: n(media) },
        ],
        recent: recent.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          joinedAt: r.joinedAt.toISOString(),
          lastActive: r.lastActive ?? null,
        })),
      },
    };
  } catch (error) {
    console.error("[admin] stats read failed", error);
    return { kind: "failed" };
  }
}
