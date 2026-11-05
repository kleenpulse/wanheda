"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { importStatement as importStored, undoImport as undoStored } from "@/lib/money/import-store";
import { importWriteSchema, type ImportResult, type UndoImportResult } from "@/lib/money/import/write";

// Statement imports (SPEC T37, V32). The file is read on the device; only the
// rows the owner confirmed come here. The owner comes from the session and the
// account is checked against it in the store (V7, V28). Demo imports stay on
// the device.

/** Imports one confirmed statement in one transaction. */
export async function importStatement(input: unknown): Promise<ImportResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = importWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await importStored(owner.user.id, parsed.data);
    if (!outcome) return { ok: false, reason: "failed" };
    switch (outcome.kind) {
      case "imported":
        return { ok: true, batch: outcome.batch, txns: outcome.txns };
      case "already":
        return { ok: false, reason: "already", importedOn: outcome.importedOn };
      case "not-yours":
        return { ok: false, reason: "invalid" };
      case "archived-account":
        return { ok: false, reason: "archived-account" };
    }
  } catch (error) {
    console.error("importStatement failed", error);
    return { ok: false, reason: "failed" };
  }
}

const idSchema = z.object({ id: z.uuid() }).strict();

/** Undoes an import: its txns go with it. Already gone counts as done. */
export async function undoImport(input: unknown): Promise<UndoImportResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const removed = await undoStored(owner.user.id, parsed.data.id);
    return removed === null ? { ok: false, reason: "failed" } : { ok: true, removed };
  } catch (error) {
    console.error("undoImport failed", error);
    return { ok: false, reason: "failed" };
  }
}
