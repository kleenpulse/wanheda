import "server-only";
import { getDb } from "@/lib/db";
import { userActivity } from "@/lib/db/schema";
import { utcDay } from "./series";

// Marks a user active today (ADR-0015). Called after the reply by getOwner, so
// it runs on many requests: a per-instance set means one insert per user per
// day per server instance, and the primary key settles the rest. Never throws:
// a missed mark costs one count, a thrown one would cost a log line per request.

let today = "";
const marked = new Set<string>();

export async function recordActivity(userId: string, now: Date = new Date()): Promise<void> {
  const day = utcDay(now);
  if (day !== today) {
    today = day;
    marked.clear();
  }
  if (marked.has(userId)) return;
  const db = getDb();
  if (!db) return;
  marked.add(userId);
  try {
    await db.insert(userActivity).values({ userId, day }).onConflictDoNothing();
  } catch {
    // Try again on a later request.
    marked.delete(userId);
  }
}
