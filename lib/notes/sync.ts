import { sortNotes, type Note } from "./notes";

// The client side of note sync (ADR-0008), kept free of React so it can be
// tested. Local edits live in an overlay above the server list until the
// server confirms them, so a refetch or an RSC hydration that lands before
// the confirmation never rolls an edit back. Writes travel through the
// outbox (./outbox.ts).

/** Local edits: a note, or null for one deleted here and not yet confirmed. */
export type Overlay = Readonly<Record<string, Note | null>>;

/** The list the owner sees: server notes with local edits on top. */
export function mergeNotes(server: readonly Note[], overlay: Overlay): Note[] {
  const out = new Map<string, Note>();
  for (const n of server) out.set(n.id, n);
  for (const [id, local] of Object.entries(overlay)) {
    if (local === null) out.delete(id);
    else out.set(id, local);
  }
  return sortNotes([...out.values()]);
}

export function upsertNote(notes: readonly Note[], next: Note): Note[] {
  const i = notes.findIndex((n) => n.id === next.id);
  if (i === -1) return [next, ...notes];
  const copy = [...notes];
  copy[i] = next;
  return copy;
}

export function removeNote(notes: readonly Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id);
}

/** What one send came back with: the save action's result, or a thrown request. */
export type SendResult =
  | { ok: true; kind: "saved" | "unchanged"; note: Note }
  | { ok: true; kind: "conflict"; note: Note; won: boolean }
  | { ok: false; reason: "demo" | "invalid" | "failed" };

/** Whether the server now holds this write's content (so later writes build on its version). */
export function landed(result: SendResult): result is Extract<SendResult, { ok: true }> {
  return result.ok && (result.kind !== "conflict" || result.won);
}

/** queued: kept on this device until the connection is back. local: demo, never sent. */
export type NoteStatus = "queued" | "saving" | "saved" | "retrying" | "local" | "error";
