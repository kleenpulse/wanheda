import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountVoices } from "@/lib/db/schema";
import { parseAccountVoices } from "./account-voices";

// The owner's voice list (SPEC V83). Callers pass the owner's id from
// requireOwner(), never a client-sent one (SPEC V7), and already-checked
// catalog ids. Each change is one statement on the stored array, so two
// devices changing different voices at once never undo each other.

/** The owner's voices, [] when none were saved or there is no database. Throws on a failed read. */
export async function loadAccountVoices(userId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const [row] = await db.select({ voices: accountVoices.voices }).from(accountVoices).where(eq(accountVoices.userId, userId)).limit(1);
  return parseAccountVoices(row?.voices);
}

/** Adds voices to the owner's list (a set: each once). False without a database. */
export async function addAccountVoices(userId: string, ids: readonly string[]): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const added = JSON.stringify(ids);
  await db
    .insert(accountVoices)
    .values({ userId, voices: ids })
    .onConflictDoUpdate({
      target: accountVoices.userId,
      set: {
        voices: sql`(select coalesce(jsonb_agg(distinct e), '[]'::jsonb) from jsonb_array_elements(${accountVoices.voices} || ${added}::jsonb) as e)`,
        updatedAt: sql`now()`,
      },
    });
  return true;
}

/** Takes a voice out of the owner's list. False without a database. */
export async function removeAccountVoice(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db
    .insert(accountVoices)
    .values({ userId, voices: [] })
    .onConflictDoUpdate({ target: accountVoices.userId, set: { voices: sql`${accountVoices.voices} - ${id}::text`, updatedAt: sql`now()` } });
  return true;
}
