import { z } from "zod";
import { type CategoryColor, type CategoryKind } from "./categories";
import { assertMinor, sumByCurrency, type Currency, type Money } from "./currency";
import { isDay, type Day } from "./dates";

// The money domain (FRD 6.3). Pure: shared by the store, the actions, the
// route handler and the client. Ids are made on the client, so a create that
// is sent twice lands once (SPEC V28).

export const MONEY_KEY = ["money"] as const;

export const ACCOUNT_KINDS = ["cash", "bank", "card", "wallet", "crypto"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const TXN_SOURCES = ["manual", "import", "bank", "webhook"] as const;
export type TxnSource = (typeof TXN_SOURCES)[number];

export interface Account {
  id: string;
  slug: string | null;
  name: string;
  kind: AccountKind;
  currency: Currency;
  openingMinor: number;
  archived: boolean;
}

export interface Category {
  id: string;
  slug: string | null;
  name: string;
  parentId: string | null;
  emoji: string;
  color: CategoryColor;
  kind: CategoryKind;
  archived: boolean;
}

export interface Txn {
  id: string;
  accountId: string;
  postedOn: Day;
  /** < 0 money out, > 0 money in (V25). */
  amountMinor: number;
  currency: Currency;
  payee: string;
  categoryId: string | null;
  note: string;
  tags: string[];
  source: TxnSource;
  transferId: string | null;
  createdAt: number;
}

export type MoneySource = "owner" | "demo" | "load-failed";

/** What /api/money serves and the money page prefetches. */
export interface MoneyPayload {
  source: MoneySource;
  baseCurrency: Currency;
  timeZone: string;
  /** The first day the txn list covers. */
  since: Day;
  accounts: Account[];
  categories: Category[];
  /** Newest first: posted day, then entry time. */
  txns: Txn[];
}

export const PAYEE_MAX = 200;
export const NOTE_MAX = 2000;
export const TAG_MAX = 40;
export const TAGS_MAX = 20;

const day = z.string().refine(isDay, "Not a calendar day");
const minor = z.number().refine((n) => Number.isSafeInteger(n) && n !== 0, "Amount must be a non-zero whole number of minor units");

/** One txn write from the client. No currency and no owner: the server sets both (V7, V28). */
export const txnWriteSchema = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    postedOn: day,
    amountMinor: minor,
    payee: z.string().trim().max(PAYEE_MAX),
    categoryId: z.uuid().nullable(),
    note: z.string().max(NOTE_MAX),
    tags: z
      .array(z.string().trim().toLowerCase().min(1).max(TAG_MAX))
      .max(TAGS_MAX)
      .transform((tags) => [...new Set(tags)]),
  })
  .strict();

export type TxnWrite = z.infer<typeof txnWriteSchema>;

/** The txn a write turns into, given the account it lands on. */
export function txnFromWrite(w: TxnWrite, account: Pick<Account, "currency">, createdAt: number): Txn {
  return {
    id: w.id,
    accountId: w.accountId,
    postedOn: w.postedOn,
    amountMinor: assertMinor(w.amountMinor),
    currency: account.currency,
    payee: w.payee,
    categoryId: w.categoryId,
    note: w.note,
    tags: w.tags,
    source: "manual",
    transferId: null,
    createdAt,
  };
}

export function writeOf(t: Txn): TxnWrite {
  return {
    id: t.id,
    accountId: t.accountId,
    postedOn: t.postedOn,
    amountMinor: t.amountMinor,
    payee: t.payee,
    categoryId: t.categoryId,
    note: t.note,
    tags: t.tags,
  };
}

/** Newest first: by day, then by entry time, then id so the order is total. */
export function compareTxns(a: Txn, b: Txn): number {
  if (a.postedOn !== b.postedOn) return a.postedOn < b.postedOn ? 1 : -1;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export type Flow = "spend" | "income" | "transfer";

/**
 * Which side of the ledger a txn counts on (V25). Transfers count on neither.
 * A categorised txn follows its category, so a refund into Food lowers Food's
 * spend; an uncategorised one follows its sign.
 */
export function flowOf(t: Pick<Txn, "amountMinor" | "categoryId" | "transferId">, categories: ReadonlyMap<string, Category>): Flow {
  if (t.transferId) return "transfer";
  const kind = t.categoryId ? categories.get(t.categoryId)?.kind : undefined;
  if (kind === "transfer") return "transfer";
  if (kind === "expense") return "spend";
  if (kind === "income") return "income";
  return t.amountMinor < 0 ? "spend" : "income";
}

export interface Totals {
  /** Spend as positive amounts, one per currency. */
  spend: Money[];
  income: Money[];
  /** Txns counted on either side; spendCount is the spend side alone. */
  count: number;
  spendCount: number;
}

/** Spend and income over [from, to], per currency (never added across currencies). */
export function totals(txns: readonly Txn[], categories: ReadonlyMap<string, Category>, from: Day, to: Day): Totals {
  const spend: Money[] = [];
  const income: Money[] = [];
  let count = 0;
  let spendCount = 0;
  for (const t of txns) {
    if (t.postedOn < from || t.postedOn > to) continue;
    const flow = flowOf(t, categories);
    if (flow === "transfer") continue;
    count++;
    if (flow === "spend") {
      spendCount++;
      spend.push({ minor: -t.amountMinor, currency: t.currency });
    }
    else income.push({ minor: t.amountMinor, currency: t.currency });
  }
  return { spend: sumByCurrency(spend), income: sumByCurrency(income), count, spendCount };
}

export function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

/** "Food & drink › Eating out" for a child, the name for a top-level one. */
export function categoryPath(c: Category, categories: ReadonlyMap<string, Category>): string {
  const parent = c.parentId ? categories.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

/** The account a new txn goes to: the last one used if still open, else the first open one. */
export function defaultAccount(accounts: readonly Account[], lastUsed: string | null): Account | null {
  const open = accounts.filter((a) => !a.archived);
  return open.find((a) => a.id === lastUsed) ?? open[0] ?? null;
}

/** Writes optimistically into a payload (V24): replace by id, keep newest-first order. */
export function upsertTxn(payload: MoneyPayload, txn: Txn): MoneyPayload {
  const txns = payload.txns.filter((t) => t.id !== txn.id);
  txns.push(txn);
  txns.sort(compareTxns);
  return { ...payload, txns };
}

export function removeTxn(payload: MoneyPayload, id: string): MoneyPayload {
  return { ...payload, txns: payload.txns.filter((t) => t.id !== id) };
}

/** Writes still on their way: a txn to show, or null for one being deleted. */
export type PendingTxns = Readonly<Record<string, Txn | null>>;

/**
 * The payload as the owner should see it: the server's rows with this
 * device's unconfirmed writes laid over them, so a refetch that lands before
 * a write is confirmed never makes the row blink out (V24).
 */
export function applyPending(payload: MoneyPayload, pending: PendingTxns): MoneyPayload {
  const ids = Object.keys(pending);
  if (ids.length === 0) return payload;
  let next = payload;
  for (const id of ids) {
    const t = pending[id];
    next = t ? upsertTxn(next, t) : removeTxn(next, id);
  }
  return next;
}
