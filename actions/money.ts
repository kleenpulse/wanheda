"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { accountWriteSchema, txnWriteSchema } from "@/lib/money/money";
import type { AccountWriteResult, TxnDeleteResult, TxnSaveResult } from "@/lib/money/outbox";
import {
  deleteTxn as deleteStoredTxn,
  removeCategory as removeStoredCategory,
  saveAccount as saveStoredAccount,
  saveTxn as saveStoredTxn,
  setAccountArchived,
} from "@/lib/money/store";

// Money writes (FR-MONEY-2, 3). Reads go through /api/money. The owner comes
// from the session and every id in the input is checked against it in the
// store (SPEC V7, V28); demo writes stay on the device.

// The result shapes live with the outbox that sends these (lib/money/outbox.ts).
export type SaveTxnResult = TxnSaveResult;
export type DoneResult = TxnDeleteResult;
export type AccountResult = AccountWriteResult;
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

/** Creates or edits an account (FR-MONEY-1). The currency is fixed once created. */
export async function saveAccount(input: unknown): Promise<AccountResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = accountWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await saveStoredAccount(owner.user.id, parsed.data);
    if (!outcome) return { ok: false, reason: "failed" };
    return outcome.kind === "saved" ? { ok: true, account: outcome.account } : { ok: false, reason: "invalid" };
  } catch (error) {
    console.error("saveAccount failed", error);
    return { ok: false, reason: "failed" };
  }
}

const archiveSchema = z.object({ id: z.uuid(), archived: z.boolean() }).strict();

/** Archives or restores an account. Archiving keeps its txns and its balance. */
export async function archiveAccount(input: unknown): Promise<AccountResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await setAccountArchived(owner.user.id, parsed.data.id, parsed.data.archived);
    if (!outcome) return { ok: false, reason: "failed" };
    return outcome === "missing" ? { ok: false, reason: "invalid" } : { ok: true, account: outcome };
  } catch (error) {
    console.error("archiveAccount failed", error);
    return { ok: false, reason: "failed" };
  }
}
