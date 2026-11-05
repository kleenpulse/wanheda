import { z } from "zod";
import { isDay } from "../dates";
import { PAYEE_MAX, type Txn } from "../money";
import { columnMappingSchema } from "./mapping";
import { BANK_NAME_MAX, MAX_IMPORT_ROWS } from "./statement";

// What the import page sends the server and what it gets back (SPEC V32).
// Pure: shared by the action, the store and the page.

const day = z.string().refine(isDay, "Not a calendar day");
const minor = z.number().refine((n) => Number.isSafeInteger(n) && n !== 0, "Amount must be a non-zero whole number of minor units");
const rowKey = z.string().min(1).max(100);

export const importRowSchema = z
  .object({
    key: rowKey,
    rowNo: z.number().int().min(1),
    postedOn: day,
    amountMinor: minor,
    payee: z.string().trim().max(PAYEE_MAX),
  })
  .strict();

export const skippedRowSchema = z
  .object({ rowNo: z.number().int().min(1), reason: z.string().max(120) })
  .strict();

/** One confirmed import. The batch id comes from the page, so a replay of the same call lands once (V28). */
export const importWriteSchema = z
  .object({
    batchId: z.uuid(),
    accountId: z.uuid(),
    filename: z.string().trim().min(1).max(200),
    /** sha256(account id ‖ file bytes), made on the device (V32). */
    fileKey: z.string().regex(/^[0-9a-f]{64}$/),
    rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
    skipped: z.array(skippedRowSchema).max(MAX_IMPORT_ROWS),
    /** Saved under this bank name for next time; null = don't save. */
    mapping: z.object({ bankName: z.string().trim().min(1).max(BANK_NAME_MAX), columns: columnMappingSchema }).strict().nullable(),
  })
  .strict()
  .refine((w) => new Set(w.rows.map((r) => r.key)).size === w.rows.length, "Row keys must be unique");

export type ImportWrite = z.infer<typeof importWriteSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;

/** One import as the history lists it. */
export interface ImportBatchInfo {
  id: string;
  accountId: string;
  filename: string;
  /** Every line under the header: txns plus skipped lines. */
  rowsTotal: number;
  /** Txns new to the account. The rest of the txns were there already. */
  rowsImported: number;
  rowsSkipped: number;
  createdAt: number;
}

export type ImportResult =
  | { ok: true; batch: ImportBatchInfo; txns: Txn[] }
  | { ok: false; reason: "already"; importedOn: number }
  | { ok: false; reason: "demo" | "invalid" | "archived-account" | "failed" };

export type UndoImportResult = { ok: true; removed: number } | { ok: false; reason: "demo" | "invalid" | "failed" };

/** What the page checks before the owner confirms: whether this file is in already, and which rows are. */
export const importCheckSchema = z
  .object({
    accountId: z.uuid(),
    fileKey: z.string().regex(/^[0-9a-f]{64}$/),
    keys: z.array(rowKey).max(MAX_IMPORT_ROWS),
  })
  .strict();

export interface ImportCheck {
  /** When this same file went into this account, or null. */
  importedOn: number | null;
  /** The keys already on the account. */
  present: string[];
}

/** Saved mappings and the latest imports, for the import page. */
export interface ImportSetup {
  mappings: { id: string; bankName: string; columns: unknown }[];
  batches: ImportBatchInfo[];
}

export const IMPORT_SETUP_KEY = ["money-import"] as const;

/** "N new, M already present" from the row keys (V32): a re-downloaded statement has a new file key, so the rows decide. */
export function splitByPresence<R extends { key: string }>(rows: readonly R[], present: ReadonlySet<string>): { fresh: R[]; already: R[] } {
  const fresh: R[] = [];
  const already: R[] = [];
  for (const r of rows) (present.has(r.key) ? already : fresh).push(r);
  return { fresh, already };
}
