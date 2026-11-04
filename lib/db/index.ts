import "server-only";
import { databaseUrl } from "@/lib/capabilities";
import { createDb, type Db } from "./client";

// Importing this module never throws and never connects (SPEC V9). Callers ask
// for the handle and branch on null, so a missing DATABASE_URL means seed data,
// not an opaque 500 (pattern from rawstash).

export type { Db };

let handle: Db | undefined;

/** The DB handle, or null when no database is configured. Never assert it. */
export function getDb(): Db | null {
  const url = databaseUrl();
  if (!url) return null;
  handle ??= createDb(url);
  return handle;
}
