"use server";

import { requireOwner } from "@/lib/auth/owner";
import {
  collectionWriteSchema,
  documentCreateSchema,
  documentPatchSchema,
  idSchema,
  type Collection,
  type ReaderDoc,
} from "@/lib/reader/reader";
import {
  createDocument as createStoredDocument,
  deleteCollection as deleteStoredCollection,
  deleteDocument as deleteStoredDocument,
  saveCollection as saveStoredCollection,
  updateDocument as updateStoredDocument,
} from "@/lib/reader/store";

// Reader writes (T46). requireOwner() first and the owner from the session
// (SPEC V7); ids are the client's, so a replay is a no-op. Only metadata
// arrives here, never file bytes (V38). Demo never saves. Reading progress
// goes through POST /api/reader/progress instead, so a closing page can send
// it with sendBeacon (V41).

export type ReaderFail = { ok: false; reason: "demo" | "invalid" | "off" | "failed" | "gone" | "taken" };

export type CreateDocReply = { ok: true; existing: boolean; doc: ReaderDoc } | ReaderFail;

export async function createDocument(input: unknown): Promise<CreateDocReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = documentCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const r = await createStoredDocument(owner.user.id, parsed.data);
    if (!r) return { ok: false, reason: "off" };
    if (r.kind === "not-yours") return { ok: false, reason: "invalid" };
    return { ok: true, existing: r.kind === "existing", doc: r.doc };
  } catch (error) {
    console.error("createDocument failed", error);
    return { ok: false, reason: "failed" };
  }
}

export type DocReply = { ok: true; doc: ReaderDoc } | ReaderFail;

export async function updateDocument(input: unknown): Promise<DocReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = documentPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const r = await updateStoredDocument(owner.user.id, parsed.data);
    if (!r) return { ok: false, reason: "off" };
    if (r.kind === "not-yours") return { ok: false, reason: "invalid" };
    if (r.kind === "gone") return { ok: false, reason: "gone" };
    return { ok: true, doc: r.doc };
  } catch (error) {
    console.error("updateDocument failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function deleteDocument(input: unknown): Promise<{ ok: true } | ReaderFail> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredDocument(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "off" };
  } catch (error) {
    console.error("deleteDocument failed", error);
    return { ok: false, reason: "failed" };
  }
}

export type CollectionReply = { ok: true; collection: Collection } | ReaderFail;

export async function saveCollection(input: unknown): Promise<CollectionReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = collectionWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const r = await saveStoredCollection(owner.user.id, parsed.data);
    if (!r) return { ok: false, reason: "off" };
    if (r.kind === "not-yours") return { ok: false, reason: "invalid" };
    if (r.kind === "taken") return { ok: false, reason: "taken" };
    return { ok: true, collection: r.collection };
  } catch (error) {
    console.error("saveCollection failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function deleteCollection(input: unknown): Promise<{ ok: true } | ReaderFail> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredCollection(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "off" };
  } catch (error) {
    console.error("deleteCollection failed", error);
    return { ok: false, reason: "failed" };
  }
}
