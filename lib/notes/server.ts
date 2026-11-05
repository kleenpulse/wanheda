import "server-only";
import type { Owner } from "@/lib/auth/owner";
import { searchLocal, type Note, type NotesPayload } from "./notes";
import { seedNotes } from "./seed";
import { listNotes, searchNotes } from "./store";

// What the notes page prefetches and /api/notes serves: the owner's notes, or
// demo's seed (G4). One function, so the RSC prefetch and the client's refetch
// can never disagree on shape.

export async function notesFor(owner: Owner): Promise<NotesPayload> {
  if (owner.kind === "demo") return { source: "demo", notes: seedNotes(Date.now()) };
  const loaded = await listNotes(owner.user.id);
  return { source: loaded.kind === "loaded" ? "owner" : "load-failed", notes: loaded.notes };
}

/** Search results, or null when the search itself failed (shown as an error, SPEC V17). */
export async function searchFor(owner: Owner, query: string): Promise<Note[] | null> {
  if (owner.kind === "demo") return searchLocal(seedNotes(Date.now()), query);
  return searchNotes(owner.user.id, query);
}
