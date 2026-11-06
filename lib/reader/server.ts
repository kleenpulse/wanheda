import "server-only";
import type { Owner } from "@/lib/auth/owner";
import type { ReaderPayload } from "./reader";
import { seedLibrary } from "./seed";
import { loadLibrary } from "./store";

// What /reader prefetches and /api/reader serves: the owner's library, or
// demo's seed (G4), which never touches the database. One function, so the
// RSC prefetch and the client's refetch can't disagree on shape.

export async function readerFor(owner: Owner, now = Date.now()): Promise<ReaderPayload> {
  if (owner.kind === "demo") return { source: "demo", ...seedLibrary(now) };
  const loaded = await loadLibrary(owner.user.id);
  if (loaded.kind === "failed") return { source: "load-failed", documents: [], collections: [] };
  return { source: "owner", documents: loaded.documents, collections: loaded.collections };
}
