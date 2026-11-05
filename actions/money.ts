"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { txnWriteSchema, type Txn } from "@/lib/money/money";
import { deleteTxn as deleteStoredTxn, removeCategory as removeStoredCategory, saveTxn as saveStoredTxn } from "@/lib/money/store";

// Money writes (FR-MONEY-2, 3). Reads go through /api/money. The owner comes
// from the session and every id in the input is checked against it in the
// store (SPEC V7, V28); demo writes stay on the device.

export type SaveTxnResult = { ok: true; txn: Txn } | { ok: false; reason: "demo" | "invalid" | "archived-account" | "failed" };
export type DoneResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };
export type RemoveCategoryResult = { ok: true; kind: "archived" | "deleted" | "missing" } | { ok: false; reason: "demo" | "invalid" | "failed" };

/** Creates or edits one txn. The server sets its currency from the account. */
export async function saveTxn(input: unknown): Promise<SaveTxnResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = txnWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await saveStoredTxn(owner.user.id, parsed.data);
    if (!outcome) return { ok: false, reason: "failed" };
    if (outcome.kind === "not-yours") return { ok: false, reason: "invalid" };
    if (outcome.kind === "archived-account") return { ok: false, reason: "archived-account" };
    return { ok: true, txn: outcome.txn };
  } catch (error) {
    console.error("saveTxn failed", error);
    return { ok: false, reason: "failed" };
  }
}

const idSchema = z.object({ id: z.uuid() }).strict();

/** Deletes one txn. Already gone counts as done, so a retry settles. */
export async function deleteTxn(input: unknown): Promise<DoneResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredTxn(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("deleteTxn failed", error);
    return { ok: false, reason: "failed" };
  }
}

/** Deletes a category the owner made, or archives a seeded one (SPEC V29). */
export async function removeCategory(input: unknown): Promise<RemoveCategoryResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const kind = await removeStoredCategory(owner.user.id, parsed.data.id);
    return kind ? { ok: true, kind } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("removeCategory failed", error);
    return { ok: false, reason: "failed" };
  }
}
