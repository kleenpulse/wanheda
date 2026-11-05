import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// Money I (FRD 6.3, section 8). Every Phase 3 table arrives in one migration.
// Amounts are integer minor units in a bigint, always beside an ISO 4217 code
// (SPEC V10, V25); the app reads them as numbers and checks each one is a safe
// integer. Ids the client makes (accounts, categories, txns, subscriptions)
// have no default in the app path but keep gen_random_uuid() for seeds.
// RLS on with no policies: only the app's role reads these tables.

const currency = (name: string) => char(name, { length: 3 });
const minor = (name: string) => bigint(name, { mode: "number" });
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const isCurrency = (column: AnyPgColumn) => sql`${column} ~ '^[A-Z]{3}$'`;

// "account" is Better Auth's table (OAuth links), so the money one is money_account.
export const moneyAccount = pgTable(
  "money_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    // Only seeded rows have one, so a concurrent first load seeds once. Seeded
    // rows are archived, never deleted, so a later seed finds them (SPEC V29).
    slug: text("slug"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    currency: currency("currency").notNull(),
    openingMinor: minor("opening_minor").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("money_account_user_slug_uq").on(t.userId, t.slug),
    check("money_account_kind_ck", sql`${t.kind} in ('cash', 'bank', 'card', 'wallet', 'crypto')`),
    check("money_account_currency_ck", isCurrency(t.currency)),
  ],
).enableRLS();

export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    slug: text("slug"),
    name: text("name").notNull(),
    // Two levels at most (FR-MONEY-4); the app keeps a child's parent a top-level row.
    parentId: uuid("parent_id").references((): AnyPgColumn => category.id, { onDelete: "set null" }),
    emoji: text("emoji").notNull().default(""),
    // A data-palette key (lib/money/categories.ts), never a raw colour.
    color: text("color").notNull().default("slate"),
    kind: text("kind").notNull().default("expense"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("category_user_slug_uq").on(t.userId, t.slug),
    check("category_kind_ck", sql`${t.kind} in ('expense', 'income', 'transfer')`),
  ],
).enableRLS();

export const importMapping = pgTable(
  "import_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    bankName: text("bank_name").notNull(),
    columns: jsonb("columns").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("import_mapping_user_bank_uq").on(t.userId, t.bankName)],
).enableRLS();

export const importBatch = pgTable(
  "import_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => moneyAccount.id),
    filename: text("filename").notNull(),
    mappingId: uuid("mapping_id").references(() => importMapping.id, { onDelete: "set null" }),
    rowsTotal: integer("rows_total").notNull(),
    rowsImported: integer("rows_imported").notNull(),
    rowsSkipped: integer("rows_skipped").notNull(),
    skipped: jsonb("skipped").notNull().default(sql`'[]'::jsonb`),
    // sha256(account id ‖ file bytes): the same file twice imports nothing (SPEC V32).
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("import_batch_user_key_uq").on(t.userId, t.idempotencyKey)],
).enableRLS();

export const txn = pgTable(
  "txn",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => moneyAccount.id),
    // The calendar day as entered or as on the statement, never shifted by a time zone (SPEC V27).
    postedOn: date("posted_on", { mode: "string" }).notNull(),
    // < 0 is money out, > 0 is money in (SPEC V25).
    amountMinor: minor("amount_minor").notNull(),
    currency: currency("currency").notNull(),
    payee: text("payee").notNull().default(""),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    // Undo an import = delete its batch: its rows go with it and the file key is free again (SPEC V32).
    importBatchId: uuid("import_batch_id").references(() => importBatch.id, { onDelete: "cascade" }),
    // Both legs of a transfer share one id and count as neither spend nor income.
    transferId: uuid("transfer_id"),
    attachmentKey: text("attachment_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Import dedupe (SPEC V12, V32). Manual rows have no external id; nulls are distinct.
    unique("txn_account_source_external_uq").on(t.accountId, t.source, t.externalId),
    index("txn_user_posted_idx").on(t.userId, t.postedOn.desc()),
    index("txn_import_batch_idx").on(t.importBatchId),
    check("txn_source_ck", sql`${t.source} in ('manual', 'import', 'bank', 'webhook')`),
    check("txn_currency_ck", isCurrency(t.currency)),
  ],
).enableRLS();

export const rule = pgTable(
  "rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    match: jsonb("match").notNull(),
    action: jsonb("action").notNull(),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rule_user_priority_idx").on(t.userId, t.priority)],
).enableRLS();

export const budget = pgTable(
  "budget",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    // null = the overall budget.
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "cascade" }),
    period: text("period").notNull().default("month"),
    amountMinor: minor("amount_minor").notNull(),
    currency: currency("currency").notNull(),
    rollover: boolean("rollover").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One overall budget per period too: nulls count as equal here.
    unique("budget_user_category_period_uq").on(t.userId, t.categoryId, t.period).nullsNotDistinct(),
    check("budget_period_ck", sql`${t.period} = 'month'`),
    check("budget_amount_ck", sql`${t.amountMinor} > 0`),
    check("budget_currency_ck", isCurrency(t.currency)),
  ],
).enableRLS();

export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    name: text("name").notNull(),
    // The charge, as a positive amount.
    amountMinor: minor("amount_minor").notNull(),
    currency: currency("currency").notNull(),
    cycle: text("cycle").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    // One known renewal day. Every renewal is counted from it, so month ends never drift (SPEC V30).
    anchorOn: date("anchor_on", { mode: "string" }).notNull(),
    trialEndsOn: date("trial_ends_on", { mode: "string" }),
    remindDays: integer("remind_days").notNull().default(3),
    accountId: uuid("account_id").references(() => moneyAccount.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    cancelUrl: text("cancel_url"),
    logoUrl: text("logo_url"),
    detectedFromTxn: boolean("detected_from_txn").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("subscription_user_idx").on(t.userId),
    check("subscription_cycle_ck", sql`${t.cycle} in ('day', 'week', 'month', 'year')`),
    check("subscription_interval_ck", sql`${t.intervalCount} between 1 and 366`),
    check("subscription_status_ck", sql`${t.status} in ('active', 'paused', 'cancelled')`),
    check("subscription_amount_ck", sql`${t.amountMinor} > 0`),
    check("subscription_remind_ck", sql`${t.remindDays} between 0 and 60`),
    check("subscription_currency_ck", isCurrency(t.currency)),
  ],
).enableRLS();

// Daily FX rates (FR-MONEY-14). Shared market data, not owner data, so no user_id.
export const fxRate = pgTable(
  "fx_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    onDate: date("on_date", { mode: "string" }).notNull(),
    base: currency("base").notNull(),
    quote: currency("quote").notNull(),
    // Read as a decimal string and converted with integer maths (SPEC V26).
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("fx_rate_day_pair_uq").on(t.onDate, t.base, t.quote),
    check("fx_rate_positive_ck", sql`${t.rate} > 0`),
  ],
).enableRLS();
