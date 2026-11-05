import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { category, moneyAccount, txn, userPrefs } from "@/lib/db/schema";
import { DEFAULT_CATEGORIES, isCategoryColor, isCategoryKind } from "./categories";
import { assertMinor, isCurrency, type Currency } from "./currency";
import { addMonths, DEFAULT_TIME_ZONE, isTimeZone, todayIn, type Day } from "./dates";
import {
  ACCOUNT_KINDS,
  TXN_SOURCES,
  type Account,
  type AccountKind,
  type Category,
  type Txn,
  type TxnSource,
  type TxnWrite,
} from "./money";

// Money persistence. Callers pass the owner's id from requireOwner(), never a
// client-sent one (SPEC V7, V28). Reads never throw: a failure is reported so
// the page keeps what the device already shows (V17). Amounts are checked to
// be safe integers on the way out of the database (V25).

export const TXN_LIST_LIMIT = 5000;

export interface MoneySettings {
  baseCurrency: Currency;
  timeZone: string;
}

export type LoadedMoney =
  | { kind: "loaded"; settings: MoneySettings; today: Day; since: Day; accounts: Account[]; categories: Category[]; txns: Txn[] }
  | { kind: "failed" };

type AccountRow = typeof moneyAccount.$inferSelect;
type CategoryRow = typeof category.$inferSelect;
type TxnRow = typeof txn.$inferSelect;

function toAccount(r: AccountRow): Account | null {
  if (!isCurrency(r.currency) || !(ACCOUNT_KINDS as readonly string[]).includes(r.kind)) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind as AccountKind,
    currency: r.currency,
    openingMinor: assertMinor(r.openingMinor),
    archived: r.archived,
  };
}

function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    parentId: r.parentId,
    emoji: r.emoji,
    color: isCategoryColor(r.color) ? r.color : "slate",
    kind: isCategoryKind(r.kind) ? r.kind : "expense",
    archived: r.archived,
  };
}

function toTxn(r: TxnRow): Txn | null {
  // A currency this build does not know is skipped, not guessed (V26).
  if (!isCurrency(r.currency)) return null;
  return {
    id: r.id,
    accountId: r.accountId,
    postedOn: r.postedOn,
    amountMinor: assertMinor(r.amountMinor),
    currency: r.currency,
    payee: r.payee,
    categoryId: r.categoryId,
    note: r.note,
    tags: r.tags,
    source: (TXN_SOURCES as readonly string[]).includes(r.source) ? (r.source as TxnSource) : "manual",
    transferId: r.transferId,
    createdAt: r.createdAt.getTime(),
  };
}

const present = <T,>(x: T | null): x is T => x !== null;

/**
 * The default categories and a Cash account, inserted once (V29). Every row
 * carries a slug and lands with ON CONFLICT DO NOTHING on (user_id, slug), so
 * two first loads at once seed once, and a seeded row the owner archived stays
 * archived. Children find their parent by slug inside the same batch.
 */
async function seedOwner(userId: string, baseCurrency: Currency): Promise<void> {
  const db = getDb();
  if (!db) return;
  const parents = DEFAULT_CATEGORIES.filter((c) => !c.parent);
  const children = DEFAULT_CATEGORIES.filter((c) => c.parent);
  const base = (c: (typeof DEFAULT_CATEGORIES)[number]) => ({ userId, slug: c.slug, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind });
  await db.batch([
    db
      .insert(moneyAccount)
      .values({ userId, slug: "cash", name: "Cash", kind: "cash", currency: baseCurrency })
      .onConflictDoNothing({ target: [moneyAccount.userId, moneyAccount.slug] }),
    db.insert(category).values(parents.map(base)).onConflictDoNothing({ target: [category.userId, category.slug] }),
    db
      .insert(category)
      .values(
        children.map((c) => ({
          ...base(c),
          parentId: sql<string>`(select ${category.id} from ${category} where ${category.userId} = ${userId} and ${category.slug} = ${c.parent ?? ""})`,
        })),
      )
      .onConflictDoNothing({ target: [category.userId, category.slug] }),
  ]);
}

function settingsOf(row: { baseCurrency: string; timeZone: string } | undefined): MoneySettings {
  return {
    baseCurrency: row && isCurrency(row.baseCurrency) ? row.baseCurrency : "NGN",
    timeZone: row && isTimeZone(row.timeZone) ? row.timeZone : DEFAULT_TIME_ZONE,
  };
}

/** The window the money page loads: this month and the two before it. */
export function windowStart(today: Day): Day {
  return addMonths(today, -2);
}

export async function loadMoney(userId: string, now = new Date()): Promise<LoadedMoney> {
  const db = getDb();
  if (!db) return { kind: "failed" };
  try {
    const [prefsRows, seeded, cash] = await db.batch([
      db
        .select({ baseCurrency: userPrefs.baseCurrency, timeZone: userPrefs.timeZone })
        .from(userPrefs)
        .where(eq(userPrefs.userId, userId))
        .limit(1),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(category)
        .where(and(eq(category.userId, userId), isNotNull(category.slug))),
      db
        .select({ id: moneyAccount.id })
        .from(moneyAccount)
        .where(and(eq(moneyAccount.userId, userId), eq(moneyAccount.slug, "cash")))
        .limit(1),
    ]);
    const settings = settingsOf(prefsRows[0]);
    const today = todayIn(settings.timeZone, now);
    const since = windowStart(today);
    // Archived seeded rows still count, so this only runs for a new owner or a new default.
    if ((seeded[0]?.n ?? 0) < DEFAULT_CATEGORIES.length || cash.length === 0) await seedOwner(userId, settings.baseCurrency);

    const [accountRows, categoryRows, txnRows] = await db.batch([
      db.select().from(moneyAccount).where(eq(moneyAccount.userId, userId)).orderBy(moneyAccount.createdAt),
      db.select().from(category).where(eq(category.userId, userId)).orderBy(category.createdAt, category.name),
      db
        .select()
        .from(txn)
        .where(and(eq(txn.userId, userId), gte(txn.postedOn, since)))
        .orderBy(desc(txn.postedOn), desc(txn.createdAt), desc(txn.id))
        .limit(TXN_LIST_LIMIT),
    ]);
    return {
      kind: "loaded",
      settings,
      today,
      since,
      accounts: accountRows.map(toAccount).filter(present),
      categories: categoryRows.map(toCategory),
      txns: txnRows.map(toTxn).filter(present),
    };
  } catch (error) {
    console.error("loadMoney failed", error);
    return { kind: "failed" };
  }
}

export type SaveTxnOutcome = { kind: "saved"; txn: Txn } | { kind: "not-yours" } | { kind: "archived-account" };

/**
 * Creates or edits one txn (V28). The account and category must be the
 * owner's; the currency is the account's, whatever the client thinks. A
 * create sent twice updates the row to the same values, so a replay is a
 * no-op. Another user's id never matches the upsert's WHERE, so nothing of
 * theirs is touched. Imported rows keep their source and external id.
 * Null when there is no database.
 */
export async function saveTxn(userId: string, w: TxnWrite): Promise<SaveTxnOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [accounts, categories] = await db.batch([
    db
      .select({ currency: moneyAccount.currency, archived: moneyAccount.archived })
      .from(moneyAccount)
      .where(and(eq(moneyAccount.id, w.accountId), eq(moneyAccount.userId, userId)))
      .limit(1),
    db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, w.categoryId ?? "00000000-0000-0000-0000-000000000000"), eq(category.userId, userId)))
      .limit(1),
  ]);
  const account = accounts[0];
  if (!account || !isCurrency(account.currency)) return { kind: "not-yours" };
  if (w.categoryId !== null && categories.length === 0) return { kind: "not-yours" };

  const values = {
    accountId: w.accountId,
    postedOn: w.postedOn,
    amountMinor: assertMinor(w.amountMinor),
    currency: account.currency,
    payee: w.payee,
    categoryId: w.categoryId,
    note: w.note,
    tags: w.tags,
  };
  if (account.archived) {
    // No new rows on an archived account; an edit to one already there still applies.
    const updated = await db
      .update(txn)
      .set({ ...values, updatedAt: sql`now()` })
      .where(and(eq(txn.id, w.id), eq(txn.userId, userId)))
      .returning();
    const u = updated[0] ? toTxn(updated[0]) : null;
    return u ? { kind: "saved", txn: u } : { kind: "archived-account" };
  }
  const rows = await db
    .insert(txn)
    .values({ id: w.id, userId, ...values })
    .onConflictDoUpdate({ target: txn.id, set: { ...values, updatedAt: sql`now()` }, setWhere: eq(txn.userId, userId) })
    .returning();
  const saved = rows[0] ? toTxn(rows[0]) : null;
  return saved ? { kind: "saved", txn: saved } : { kind: "not-yours" };
}

/** Deletes one txn. True when it is gone (or never was the owner's); null without a database. */
export async function deleteTxn(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(txn).where(and(eq(txn.id, id), eq(txn.userId, userId)));
  return true;
}

/** Seeded rows are archived, never deleted, so the seed never brings them back (V29). */
export function removalFor(row: { slug: string | null }): "archive" | "delete" {
  return row.slug === null ? "delete" : "archive";
}

export type RemoveOutcome = "archived" | "deleted" | "missing";

/**
 * Removes a category the owner made, or archives a seeded one (V29). Its txns
 * keep their rows and lose the category (FK set null); its children move up.
 */
export async function removeCategory(userId: string, id: string): Promise<RemoveOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ slug: category.slug })
    .from(category)
    .where(and(eq(category.id, id), eq(category.userId, userId)))
    .limit(1);
  if (!row) return "missing";
  if (removalFor(row) === "archive") {
    await db
      .update(category)
      .set({ archived: true, updatedAt: sql`now()` })
      .where(and(eq(category.id, id), eq(category.userId, userId)));
    return "archived";
  }
  await db.delete(category).where(and(eq(category.id, id), eq(category.userId, userId)));
  return "deleted";
}
