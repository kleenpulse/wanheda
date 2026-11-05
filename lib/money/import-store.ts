import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { importBatch, importMapping, moneyAccount, txn } from "@/lib/db/schema";
import { assertMinor, isCurrency } from "./currency";
import type { Txn } from "./money";
import type { ImportBatchInfo, ImportCheck, ImportSetup, ImportWrite } from "./import/write";
import { present, toTxn } from "./store";

// Statement imports (SPEC V12, V32). Callers pass the owner's id from
// requireOwner() (V7). The batch row, the saved mapping and every txn land in
// one neon-http batch, which runs as one transaction: all of it or none.

/** Rows per insert statement: well under Postgres' 65,535 parameters. */
const INSERT_CHUNK = 500;
/** Imports the page lists for undo. */
const HISTORY_LIMIT = 20;

type BatchRow = typeof importBatch.$inferSelect;

function toBatchInfo(r: BatchRow): ImportBatchInfo {
  return {
    id: r.id,
    accountId: r.accountId,
    filename: r.filename,
    rowsTotal: r.rowsTotal,
    rowsImported: r.rowsImported,
    rowsSkipped: r.rowsSkipped,
    createdAt: r.createdAt.getTime(),
  };
}

export type ImportOutcome =
  | { kind: "imported"; batch: ImportBatchInfo; txns: Txn[] }
  | { kind: "already"; importedOn: number }
  | { kind: "not-yours" }
  | { kind: "archived-account" };

async function batchByKey(db: Db, userId: string, key: string): Promise<BatchRow | undefined> {
  const [row] = await db
    .select()
    .from(importBatch)
    .where(and(eq(importBatch.userId, userId), eq(importBatch.idempotencyKey, key)))
    .limit(1);
  return row;
}

/** The answer when this file is in already: the same call replayed gets its own result back, another call is told when. */
async function settled(db: Db, userId: string, w: ImportWrite, row: BatchRow): Promise<ImportOutcome> {
  if (row.id !== w.batchId) return { kind: "already", importedOn: row.createdAt.getTime() };
  const rows = await db
    .select()
    .from(txn)
    .where(and(eq(txn.userId, userId), eq(txn.importBatchId, row.id)));
  return { kind: "imported", batch: toBatchInfo(row), txns: rows.map(toTxn).filter(present) };
}

/**
 * Imports one confirmed statement into one of the owner's accounts (V32).
 * The same file twice (same account) is refused by `import_batch`'s unique
 * key; a row already on the account (an overlapping statement) is passed over
 * by `txn`'s unique (account, source, external id). Null without a database.
 */
export async function importStatement(userId: string, w: ImportWrite): Promise<ImportOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [account] = await db
    .select({ currency: moneyAccount.currency, archived: moneyAccount.archived })
    .from(moneyAccount)
    .where(and(eq(moneyAccount.id, w.accountId), eq(moneyAccount.userId, userId)))
    .limit(1);
  if (!account || !isCurrency(account.currency)) return { kind: "not-yours" };
  if (account.archived) return { kind: "archived-account" };
  const before = await batchByKey(db, userId, w.fileKey);
  if (before) return settled(db, userId, w, before);

  const mapping = w.mapping;
  const statements = [];
  if (mapping) {
    statements.push(
      db
        .insert(importMapping)
        .values({ userId, bankName: mapping.bankName, columns: mapping.columns })
        .onConflictDoUpdate({ target: [importMapping.userId, importMapping.bankName], set: { columns: mapping.columns, updatedAt: sql`now()` } }),
    );
  }
  statements.push(
    db.insert(importBatch).values({
      id: w.batchId,
      userId,
      accountId: w.accountId,
      filename: w.filename,
      mappingId: mapping
        ? sql<string>`(select ${importMapping.id} from ${importMapping} where ${importMapping.userId} = ${userId} and ${importMapping.bankName} = ${mapping.bankName})`
        : null,
      rowsTotal: w.rows.length + w.skipped.length,
      rowsImported: 0,
      rowsSkipped: w.skipped.length,
      skipped: w.skipped,
      idempotencyKey: w.fileKey,
    }),
  );
  const inserts = [];
  for (let i = 0; i < w.rows.length; i += INSERT_CHUNK) {
    inserts.push(
      db
        .insert(txn)
        .values(
          w.rows.slice(i, i + INSERT_CHUNK).map((r) => ({
            userId,
            accountId: w.accountId,
            postedOn: r.postedOn,
            amountMinor: assertMinor(r.amountMinor),
            currency: account.currency,
            payee: r.payee,
            source: "import",
            externalId: r.key,
            importBatchId: w.batchId,
          })),
        )
        .onConflictDoNothing({ target: [txn.accountId, txn.source, txn.externalId] })
        .returning(),
    );
  }
  const count = db
    .update(importBatch)
    .set({ rowsImported: sql<number>`(select count(*)::int from ${txn} where ${txn.importBatchId} = ${w.batchId})` })
    .where(eq(importBatch.id, w.batchId))
    .returning();

  type Item = Parameters<Db["batch"]>[0][number];
  const all = [...statements, ...inserts, count] as unknown as [Item, ...Item[]];
  let results: unknown[];
  try {
    results = await db.batch(all);
  } catch (error) {
    // Two imports of one file at once: the other one won the unique key. Anything else is a real failure.
    const raced = await batchByKey(db, userId, w.fileKey);
    if (raced) return settled(db, userId, w, raced);
    throw error;
  }
  const inserted = results.slice(statements.length, statements.length + inserts.length) as (typeof txn.$inferSelect)[][];
  const [batch] = results.at(-1) as BatchRow[];
  if (!batch) throw new Error("import batch row missing after insert");
  return { kind: "imported", batch: toBatchInfo(batch), txns: inserted.flat().map(toTxn).filter(present) };
}

/** Undoes an import: its batch goes and its txns with it (FK cascade), and the file key is free again (V32). Rows removed; 0 when already gone. */
export async function undoImport(userId: string, batchId: string): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .delete(importBatch)
    .where(and(eq(importBatch.id, batchId), eq(importBatch.userId, userId)))
    .returning({ rowsImported: importBatch.rowsImported });
  return rows[0]?.rowsImported ?? 0;
}

/** Is this file in already, and which of these row keys are on the account (the preview's "already present"). Null without a database. */
export async function checkImport(userId: string, accountId: string, fileKey: string, keys: readonly string[]): Promise<ImportCheck | null> {
  const db = getDb();
  if (!db) return null;
  const [batches, rows] = await db.batch([
    db
      .select({ createdAt: importBatch.createdAt })
      .from(importBatch)
      .where(and(eq(importBatch.userId, userId), eq(importBatch.idempotencyKey, fileKey)))
      .limit(1),
    db
      .select({ key: txn.externalId })
      .from(txn)
      .where(and(eq(txn.userId, userId), eq(txn.accountId, accountId), eq(txn.source, "import"), inArray(txn.externalId, keys.length > 0 ? [...keys] : [""]))),
  ]);
  return {
    importedOn: batches[0]?.createdAt.getTime() ?? null,
    present: rows.map((r) => r.key).filter((k): k is string => k !== null),
  };
}

/** The owner's saved mappings (latest used first) and their latest imports. Null without a database. */
export async function loadImportSetup(userId: string): Promise<ImportSetup | null> {
  const db = getDb();
  if (!db) return null;
  const [mappings, batches] = await db.batch([
    db
      .select({ id: importMapping.id, bankName: importMapping.bankName, columns: importMapping.columns })
      .from(importMapping)
      .where(eq(importMapping.userId, userId))
      .orderBy(desc(importMapping.updatedAt)),
    db.select().from(importBatch).where(eq(importBatch.userId, userId)).orderBy(desc(importBatch.createdAt)).limit(HISTORY_LIMIT),
  ]);
  return { mappings, batches: batches.map(toBatchInfo) };
}
