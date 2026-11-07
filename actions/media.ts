"use server";

import { requireOwner } from "@/lib/auth/owner";
import { idSchema, itemCreateSchema, type DeleteReply, type ItemReply } from "@/lib/media/media";
import { createItem as createStoredItem, deleteItem as deleteStoredItem } from "@/lib/media/store";

// Media writes (T61). requireOwner() first and the owner from the session
// (SPEC V7); ids are the client's, so a replay is a no-op. Only metadata
// arrives here, never file bytes (V54, V38). Demo never saves.

export async function addMediaItem(input: unknown): Promise<ItemReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = itemCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const r = await createStoredItem(owner.user.id, parsed.data);
    if (!r) return { ok: false, reason: "off" };
    if (r.kind === "not-yours") return { ok: false, reason: "not-yours" };
    return { ok: true, item: r.item, existing: r.kind === "existing" };
  } catch (error) {
    console.error("addMediaItem failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function deleteMediaItem(input: unknown): Promise<DeleteReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const r = await deleteStoredItem(owner.user.id, parsed.data.id);
    return r ? { ok: true } : { ok: false, reason: "off" };
  } catch (error) {
    console.error("deleteMediaItem failed", error);
    return { ok: false, reason: "failed" };
  }
}
