import "server-only";
import { and, desc, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { category, moneyAccount, subscription, txn, userPrefs } from "@/lib/db/schema";
import { DEFAULT_CATEGORIES, isCategoryColor, isCategoryKind } from "./categories";
import { assertMinor, isCurrency, MoneyError, type Currency } from "./currency";
import { addMonths, DEFAULT_TIME_ZONE, isTimeZone, todayIn, type Day } from "./dates";
import {
  ACCOUNT_KINDS,
  TXN_LIST_LIMIT,
  TXN_SOURCES,
  type Account,
  type AccountKind,
  type AccountWrite,
  type Category,
  type Txn,
  type TxnSource,
  type TxnWrite,
} from "./money";
import { isSubCycle, isSubStatus, type Subscription, type SubscriptionWrite } from "./subscriptions";

// Money persistence. Callers pass the owner's id from requireOwner(), never a
// client-sent one (SPEC V7, V28). Reads never throw: a failure is reported so
// the page keeps what the device already shows (V17). Amounts are checked to
// be safe integers on the way out of the database (V25).

/** Rows one range read returns (a custom period and the one it is compared with). */
export const TXN_RANGE_LIMIT = 10_000;

export interface MoneySettings {
  baseCurrency: Currency;
  timeZone: string;
}

export type LoadedMoney =
  | {
      kind: "loaded";
      settings: MoneySettings;
      today: Day;
      since: Day;
      accounts: Account[];
      categories: Category[];
      txns: Txn[];
      priorMinor: Record<string, number>;
      truncated: boolean;
      subscriptions: Subscription[];
    }
  | { kind: "failed" };

type AccountRow = typeof moneyAccount.$inferSelect;
type CategoryRow = typeof category.$inferSelect;
type TxnRow = typeof txn.$inferSelect;
type SubscriptionRow = typeof subscription.$inferSelect;

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

export function toTxn(r: TxnRow): Txn | null {
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

function toSubscription(r: SubscriptionRow): Subscription | null {
  // A currency, cycle or status this build does not know is skipped, not guessed.
  if (!isCurrency(r.currency) || !isSubCycle(r.cycle) || !isSubStatus(r.status)) return null;
  return {
    id: r.id,
    name: r.name,
    amountMinor: assertMinor(r.amountMinor),
    currency: r.currency,
    cycle: r.cycle,
    intervalCount: r.intervalCount,
    anchorOn: r.anchorOn,
    trialEndsOn: r.trialEndsOn,
    remindDays: r.remindDays,
    accountId: r.accountId,
    categoryId: r.categoryId,
    status: r.status,
    cancelUrl: r.cancelUrl,
    detectedFromTxn: r.detectedFromTxn,
    createdAt: r.createdAt.getTime(),
  };
}

export const present = <T,>(x: T | null): x is T => x !== null;

/** A bigint sum read as text: exact, or a MoneyError past 2^53 (V25). */
export function minorFromText(text: string): number {
  const exact = BigInt(text);
  const n = Number(exact);
  if (!Number.isSafeInteger(n) || BigInt(n) !== exact) throw new MoneyError(`Sum is not a safe integer: ${text}`);
  return n;
}

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

    const [accountRows, categoryRows, txnRows, priorRows, subRows] = await db.batch([
      db.select().from(moneyAccount).where(eq(moneyAccount.userId, userId)).orderBy(moneyAccount.createdAt),
      db.select().from(category).where(eq(category.userId, userId)).orderBy(category.createdAt, category.name),
      db
        .select()
        .from(txn)
        .where(and(eq(txn.userId, userId), gte(txn.postedOn, since)))
        .orderBy(desc(txn.postedOn), desc(txn.createdAt), desc(txn.id))
        .limit(TXN_LIST_LIMIT + 1),
      // Everything before the window, summed per account, for balances.
      db
        .select({ accountId: txn.accountId, total: sql<string>`coalesce(sum(${txn.amountMinor}), 0)::text` })
        .from(txn)
        .where(and(eq(txn.userId, userId), lt(txn.postedOn, since)))
        .groupBy(txn.accountId),
      db.select().from(subscription).where(eq(subscription.userId, userId)).orderBy(subscription.createdAt),
    ]);
    return {
      kind: "loaded",
      settings,
      today,
      since,
      accounts: accountRows.map(toAccount).filter(present),
      categories: categoryRows.map(toCategory),
      // One row past the cap says the window was cut (the oldest rows go), so the page can say so.
      txns: txnRows.slice(0, TXN_LIST_LIMIT).map(toTxn).filter(present),
      truncated: txnRows.length > TXN_LIST_LIMIT,
      priorMinor: Object.fromEntries(priorRows.map((r) => [r.accountId, minorFromText(r.total)])),
      subscriptions: subRows.map(toSubscription).filter(present),
    };
  } catch (error) {
    console.error("loadMoney failed", error);
    return { kind: "failed" };
  }
}

/**
 * The owner's txns over [from, to], newest first, for a period older than the
 * loaded window. Capped at TXN_RANGE_LIMIT rows; `truncated` says so.
 */
export async function loadTxnRange(userId: string, from: Day, to: Day): Promise<{ txns: Txn[]; truncated: boolean } | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select()
      .from(txn)
      .where(and(eq(txn.userId, userId), gte(txn.postedOn, from), lte(txn.postedOn, to)))
      .orderBy(desc(txn.postedOn), desc(txn.createdAt), desc(txn.id))
      .limit(TXN_RANGE_LIMIT + 1);
    return { txns: rows.slice(0, TXN_RANGE_LIMIT).map(toTxn).filter(present), truncated: rows.length > TXN_RANGE_LIMIT };
  } catch (error) {
    console.error("loadTxnRange failed", error);
    return null;
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

export type SaveAccountOutcome = { kind: "saved"; account: Account } | { kind: "not-yours" };

/**
 * Creates or edits one account (FR-MONEY-1, V28). The id comes from the
 * client, so a create sent twice lands once. An edit changes the name, kind
 * and opening balance only: the currency stays what it was created with.
 * Another user's id never matches the upsert's WHERE.
 */
export async function saveAccount(userId: string, w: AccountWrite): Promise<SaveAccountOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const edit = { name: w.name, kind: w.kind, openingMinor: assertMinor(w.openingMinor) };
  const rows = await db
    .insert(moneyAccount)
    .values({ id: w.id, userId, currency: w.currency, ...edit })
    .onConflictDoUpdate({ target: moneyAccount.id, set: { ...edit, updatedAt: sql`now()` }, setWhere: eq(moneyAccount.userId, userId) })
    .returning();
  const saved = rows[0] ? toAccount(rows[0]) : null;
  return saved ? { kind: "saved", account: saved } : { kind: "not-yours" };
}

/** Archives or restores one of the owner's accounts. Its txns stay; new ones can't land on it while archived. */
export async function setAccountArchived(userId: string, id: string, archived: boolean): Promise<Account | "missing" | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .update(moneyAccount)
    .set({ archived, updatedAt: sql`now()` })
    .where(and(eq(moneyAccount.id, id), eq(moneyAccount.userId, userId)))
    .returning();
  const row = rows[0] ? toAccount(rows[0]) : null;
  return row ?? "missing";
}

export type SaveSubscriptionOutcome = { kind: "saved"; subscription: Subscription } | { kind: "not-yours" };

const NO_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Creates or edits one subscription (FR-MONEY-8, V28). Its account and
 * category, when set, must be the owner's. The id comes from the client, so a
 * create sent twice lands once; another user's id never matches the upsert's
 * WHERE. `detectedFromTxn` is never taken from the client: it is set on
 * create when `fromTxn` names one of the owner's txns (T37), and an edit
 * never changes it. Null when there is no database.
 */
export async function saveSubscription(userId: string, w: SubscriptionWrite): Promise<SaveSubscriptionOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [accounts, categories, detected] = await db.batch([
    db
      .select({ id: moneyAccount.id })
      .from(moneyAccount)
      .where(and(eq(moneyAccount.id, w.accountId ?? NO_ID), eq(moneyAccount.userId, userId)))
      .limit(1),
    db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, w.categoryId ?? NO_ID), eq(category.userId, userId)))
      .limit(1),
    db
      .select({ id: txn.id })
      .from(txn)
      .where(and(eq(txn.id, w.fromTxn ?? NO_ID), eq(txn.userId, userId)))
      .limit(1),
  ]);
  if (w.accountId !== null && accounts.length === 0) return { kind: "not-yours" };
  if (w.categoryId !== null && categories.length === 0) return { kind: "not-yours" };

  const values = {
    name: w.name,
    amountMinor: assertMinor(w.amountMinor),
    currency: w.currency,
    cycle: w.cycle,
    intervalCount: w.intervalCount,
    anchorOn: w.anchorOn,
    trialEndsOn: w.trialEndsOn,
    remindDays: w.remindDays,
    accountId: w.accountId,
    categoryId: w.categoryId,
    status: w.status,
    cancelUrl: w.cancelUrl,
  };
  const rows = await db
    .insert(subscription)
    .values({ id: w.id, userId, ...values, detectedFromTxn: detected.length > 0 })
    .onConflictDoUpdate({ target: subscription.id, set: { ...values, updatedAt: sql`now()` }, setWhere: eq(subscription.userId, userId) })
    .returning();
  const saved = rows[0] ? toSubscription(rows[0]) : null;
  return saved ? { kind: "saved", subscription: saved } : { kind: "not-yours" };
}

/** Deletes one subscription. True when it is gone (or never was the owner's); null without a database. */
export async function deleteSubscription(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(subscription).where(and(eq(subscription.id, id), eq(subscription.userId, userId)));
  return true;
}

/** What the reminder check needs (V31): the owner's day and their active subscriptions. Null without a database. */
export async function loadAlertFacts(userId: string, now = new Date()): Promise<{ today: Day; subscriptions: Subscription[] } | null> {
  const db = getDb();
  if (!db) return null;
  const [prefsRows, subRows] = await db.batch([
    db
      .select({ baseCurrency: userPrefs.baseCurrency, timeZone: userPrefs.timeZone })
      .from(userPrefs)
      .where(eq(userPrefs.userId, userId))
      .limit(1),
    db
      .select()
      .from(subscription)
      .where(and(eq(subscription.userId, userId), eq(subscription.status, "active"))),
  ]);
  return { today: todayIn(settingsOf(prefsRows[0]).timeZone, now), subscriptions: subRows.map(toSubscription).filter(present) };
}
