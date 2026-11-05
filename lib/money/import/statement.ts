import { z } from "zod";
import type { Currency } from "../currency";
import { parseCsv } from "./csv";
import { fileKey, rowKeys } from "./keys";
import { columnMappingSchema, guessMapping, mapRows, missingColumns, readTable, type ColumnMapping, type SkippedRow, type StatementRow, type Table } from "./mapping";
import { detectPreset } from "./presets";
import { readHtmlTable, readXlsx, SheetError, sniffSheet } from "./xlsx";

// One statement, start to finish (SPEC T37, V32): bytes → cells → table →
// mapping → rows with their dedupe keys. Pure, so the import worker runs it
// off the main thread and the tests run it as is. Nothing here talks to the
// server: the file never leaves the device, only the rows the owner confirms.

/** Bigger than any statement a bank hands out; past it the file is refused unread. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Most rows one import sends. The server checks the same bound. */
export const MAX_IMPORT_ROWS = 5000;
export const BANK_NAME_MAX = 60;

/** A mapping the owner saved for a bank (`import_mapping`). */
export interface SavedMapping {
  id: string;
  bankName: string;
  columns: ColumnMapping;
}

export const savedMappingSchema = z.object({ id: z.uuid(), bankName: z.string().min(1).max(BANK_NAME_MAX), columns: columnMappingSchema });

/** Where the mapping in use came from, for the preview to say. */
export type MappingSource = "saved" | "preset" | "guess" | "custom";

export interface MappingPick {
  source: MappingSource;
  /** The name it is saved under: the saved mapping's or the preset's, else empty for the owner to fill. */
  bankName: string;
  presetId: string | null;
  mapping: ColumnMapping;
}

export interface KeyedRow extends StatementRow {
  /** `txn.external_id` (V12). */
  key: string;
}

export interface StatementAnalysis {
  fileKey: string;
  table: Table;
  /** The first lines under the header, for the column editor. */
  sample: string[][];
  /** Lines under the header, txns or not. */
  bodyCount: number;
  /** Null when no mapping could be guessed: the owner picks the columns. */
  pick: MappingPick | null;
  /** Columns the mapping names that this file lacks. */
  missing: string[];
  rows: KeyedRow[];
  skipped: SkippedRow[];
}

/** The cells of a statement file, whatever it is. Throws a SheetError the owner can read. */
export function readSheet(bytes: Uint8Array): string[][] {
  if (bytes.length === 0) throw new SheetError("This file is empty.");
  if (bytes.length > MAX_FILE_BYTES) throw new SheetError("This file is bigger than a statement should be (15 MB).");
  switch (sniffSheet(bytes)) {
    case "xlsx":
      return readXlsx(bytes);
    case "html":
      return readHtmlTable(bytes);
    case "xls-binary":
      throw new SheetError("This is an old Excel file (.xls). Open it and save it as .xlsx or CSV, then try again.");
    case "text": {
      const text = new TextDecoder().decode(bytes);
      if (text.includes("%PDF-")) throw new SheetError("This is a PDF. Export the statement as CSV or Excel instead.");
      return parseCsv(text);
    }
  }
}

/**
 * The mapping to start from: one the owner saved that fits this file (newest
 * first), else a bank preset, else a guess from the headers. Null when even a
 * guess finds no date or amount.
 */
export function pickMapping(table: Table, body: readonly (readonly string[])[], currency: Currency, saved: readonly SavedMapping[]): MappingPick | null {
  // A saved mapping of "Column N" names fits only a file without a header, and the other way round.
  const headerless = (m: ColumnMapping) => /^Column \d+$/.test(m.date);
  for (const s of saved) {
    if (headerless(s.columns) !== (table.headerRow === null)) continue;
    if (missingColumns(table.header, s.columns).length === 0) return { source: "saved", bankName: s.bankName, presetId: null, mapping: s.columns };
  }
  const preset = detectPreset(table);
  if (preset) return { source: "preset", bankName: preset.preset.name, presetId: preset.preset.id, mapping: preset.mapping };
  const guess = guessMapping(table, body, currency);
  return guess ? { source: "guess", bankName: "", presetId: null, mapping: guess } : null;
}

/** A mapping to start editing from when nothing could be guessed: the first columns, in order. */
export function blankMapping(header: readonly string[]): ColumnMapping {
  const at = (i: number) => header[i] ?? header[0] ?? "Column 1";
  return { date: at(0), dateOrder: "dmy", amount: { kind: "signed", column: at(1), outflow: "negative" }, payee: [at(2)], balance: null, reference: null };
}

/** The same columns with money in and out the other way round (a card export with charges positive). Null for typed amounts: their type column decides. */
export function flipSigns(m: ColumnMapping): ColumnMapping | null {
  switch (m.amount.kind) {
    case "signed":
      return { ...m, amount: { ...m.amount, outflow: m.amount.outflow === "negative" ? "positive" : "negative" } };
    case "split":
      return { ...m, amount: { kind: "split", out: m.amount.in, in: m.amount.out } };
    case "typed":
      return null;
  }
}

export interface AnalyseOptions {
  accountId: string;
  currency: Currency;
  saved: readonly SavedMapping[];
  /** The owner's own mapping (edited in the preview, or a preset picked by hand). Null = pick one. */
  mapping: MappingPick | null;
}

/** Everything the preview shows, from the file's cells and bytes. */
export async function analyseStatement(cells: readonly (readonly string[])[], bytes: Uint8Array, o: AnalyseOptions): Promise<StatementAnalysis> {
  const table = readTable(cells);
  const body = cells.slice((table.headerRow ?? -1) + 1);
  const pick = o.mapping ?? pickMapping(table, body, o.currency, o.saved);
  const key = await fileKey(o.accountId, bytes);
  const base = { fileKey: key, table, sample: body.slice(0, 8).map((r) => [...r]), bodyCount: body.length, pick };
  if (!pick) return { ...base, missing: [], rows: [], skipped: [] };
  const missing = missingColumns(table.header, pick.mapping);
  if (missing.length > 0) return { ...base, missing, rows: [], skipped: [] };
  const mapped = mapRows(cells, table, pick.mapping, o.currency);
  const rows = mapped.rows;
  const keys = await rowKeys(rows);
  return { ...base, missing, rows: rows.map((r, i) => ({ ...r, key: keys[i] ?? "" })), skipped: mapped.skipped };
}

/** What the page sends the import worker. `fileId` lets the worker reuse the cells it read last time. */
export interface WorkerRequest {
  id: number;
  fileId: number;
  bytes: ArrayBuffer;
  options: AnalyseOptions;
}

export type WorkerResponse = { id: number; ok: true; analysis: StatementAnalysis } | { id: number; ok: false; error: string };

/** A message for the owner from anything the reader throws. */
export function readError(error: unknown): string {
  if (error instanceof SheetError) return error.message;
  return "This file couldn't be read as a statement. Try a CSV or .xlsx export.";
}
