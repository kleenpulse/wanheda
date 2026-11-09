"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { queuedForAnother } from "@/lib/auth/queued";
import { noteWriteSchema, type Note } from "@/lib/notes/notes";
import { deleteNote as deleteStoredNote, saveNote as saveStoredNote } from "@/lib/notes/store";

// Note writes (FR-NOTES-1). Reads go through the /api/notes route handlers,
// because server actions run one at a time per client and a search would
// queue behind a save. The owner comes from the session (SPEC V7); demo
// writes stay on the device.

export type SaveNoteResult =
  | { ok: true; kind: "saved" | "unchanged"; note: Note }
  | { ok: true; kind: "conflict"; note: Note; won: boolean }
  | { ok: false; reason: "demo" | "invalid" | "failed" };

export type DeleteNoteResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

/** One write by SPEC V23. Returns the note as it now stands on the server. */
export async function saveNote(input: unknown, asUser?: string): Promise<SaveNoteResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  if (queuedForAnother(owner, asUser)) return { ok: false, reason: "failed" };
  const parsed = noteWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const { keepCurrent, ...write } = parsed.data;
    const outcome = await saveStoredNote(owner.user.id, keepCurrent ? { ...write, keepCurrent } : write);
    if (!outcome) return { ok: false, reason: "failed" };
    if (outcome.kind === "not-yours") return { ok: false, reason: "invalid" };
    return { ok: true, ...outcome };
  } catch (error) {
    console.error("saveNote failed", error);
    return { ok: false, reason: "failed" };
  }
}

const deleteSchema = z.object({ id: z.uuid() }).strict();

/**
 * Deletes an archived note for good. A note already gone, or taken out of the
 * archive on another device, counts as done: retrying would never change it.
 */
export async function deleteNote(input: unknown, asUser?: string): Promise<DeleteNoteResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  if (queuedForAnother(owner, asUser)) return { ok: false, reason: "failed" };
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredNote(owner.user.id, parsed.data.id)) === null ? { ok: false, reason: "failed" } : { ok: true };
  } catch (error) {
    console.error("deleteNote failed", error);
    return { ok: false, reason: "failed" };
  }
}
