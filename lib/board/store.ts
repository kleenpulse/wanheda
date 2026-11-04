import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { boardLayout } from "@/lib/db/schema";
import { BREAKPOINT_NAMES, resolveLayouts, seedLayouts, type BoardItem, type BoardLayouts, type Breakpoint } from "./layout";

// Board persistence. Callers pass the owner's id from requireOwner(), never a
// client-sent one (SPEC V7). No database means demo: the seed, never saved.

export type LoadedBoard = { kind: "loaded"; layouts: BoardLayouts } | { kind: "failed"; layouts: BoardLayouts };

/**
 * The owner's board. A failed read (database down, migration not applied)
 * still renders the seed so Home works, but says so and must not be saved
 * over: the owner's real layout may still be in the table (SPEC V17).
 */
export async function loadLayouts(userId: string): Promise<LoadedBoard> {
  const db = getDb();
  if (!db) return { kind: "loaded", layouts: seedLayouts() };
  try {
    const rows = await db
      .select({ breakpoint: boardLayout.breakpoint, layout: boardLayout.layout })
      .from(boardLayout)
      .where(eq(boardLayout.userId, userId));
    const layouts = rows.length === 0 ? seedLayouts() : resolveLayouts(Object.fromEntries(rows.map((r) => [r.breakpoint, r.layout])));
    return { kind: "loaded", layouts };
  } catch (error) {
    console.error("loadLayouts failed", error);
    return { kind: "failed", layouts: seedLayouts() };
  }
}

/** Upserts the given breakpoints' layouts (already sanitized). False when there is no database. */
export async function saveLayouts(userId: string, layouts: Partial<Record<Breakpoint, BoardItem[]>>): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = BREAKPOINT_NAMES.flatMap((bp) => {
    const layout = layouts[bp];
    return layout ? [{ userId, breakpoint: bp, layout }] : [];
  });
  if (rows.length === 0) return true;
  await db
    .insert(boardLayout)
    .values(rows)
    .onConflictDoUpdate({
      target: [boardLayout.userId, boardLayout.breakpoint],
      set: { layout: sql`excluded.layout`, updatedAt: sql`now()` },
    });
  return true;
}
