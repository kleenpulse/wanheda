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
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// Money II: income and SaaS performance (FRD 6.4, section 8). Billing events
// are an append-only log (SPEC V11, V34); everything else about MRR is derived
// from it and can be rebuilt (V35). Connector secrets are sealed (V33).
// RLS on with no policies: only the app's role reads these tables.

const currency = (name: string) => char(name, { length: 3 });
const minor = (name: string) => bigint(name, { mode: "number" });
const at = (name: string) => timestamp(name, { withTimezone: true });
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/** A SaaS the owner runs (FR-INCOME-2). Billing products map onto it through a connector. */
export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: owner(),
  name: text("name").notNull(),
  url: text("url").notNull().default(""),
  // A data-palette key, never a raw colour (SPEC V15, V29).
  color: text("color").notNull().default("slate"),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const connector = pgTable(
  "connector",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    // Set for a connector that serves one product; a Polar organization maps
    // many billing products through config.productMap instead.
    productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    // `v1.<iv>.<tag>.<ciphertext>`, AES-256-GCM with the connector id as AAD (SPEC V33).
    sealedSecret: text("sealed_secret").notNull(),
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    lastSyncedAt: at("last_synced_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("connector_provider_ck", sql`${t.provider} in ('polar')`)],
).enableRLS();

/** Webhook dedupe: one row per delivery id per connector (SPEC V13, V34). */
export const processedEvent = pgTable(
  "processed_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connector.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("processed_event_connector_event_uq").on(t.connectorId, t.eventId)],
).enableRLS();

/** Append-only. Never updated; deleted only with its connector (SPEC V34). */
export const billingEvent = pgTable(
  "billing_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connector.id, { onDelete: "cascade" }),
    // The webhook delivery id, or `sync:<object>:<id>:<modified_at>` for a pull.
    eventId: text("event_id").notNull(),
    // `subscription` | `order` | `refund`: which object the payload is a snapshot of.
    kind: text("kind").notNull(),
    // When the provider says the object last changed: the order of truth (V34).
    occurredAt: at("occurred_at").notNull(),
    objectId: text("object_id").notNull(),
    providerProductId: text("provider_product_id"),
    customerRef: text("customer_ref"),
    subscriptionRef: text("subscription_ref"),
    orderRef: text("order_ref"),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("billing_event_connector_event_uq").on(t.connectorId, t.eventId),
    index("billing_event_connector_occurred_idx").on(t.connectorId, t.occurredAt),
    check("billing_event_kind_ck", sql`${t.kind} in ('subscription', 'order', 'refund')`),
  ],
).enableRLS();

/** Derived from billing_event; rebuilt per product in one transaction (SPEC V35). */
export const mrrMovement = pgTable(
  "mrr_movement",
  {
    // hash(billing_event id, kind), so a re-run cannot duplicate a row.
    id: uuid("id").primaryKey(),
    userId: owner(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    occurredAt: at("occurred_at").notNull(),
    customerRef: text("customer_ref").notNull(),
    kind: text("kind").notNull(),
    deltaMrrMinor: minor("delta_mrr_minor").notNull(),
    currency: currency("currency").notNull(),
    billingEventId: uuid("billing_event_id")
      .notNull()
      .references(() => billingEvent.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("mrr_movement_product_occurred_idx").on(t.productId, t.occurredAt),
    check(
      "mrr_movement_kind_ck",
      sql`${t.kind} in ('new', 'expansion', 'contraction', 'churn', 'reactivation')`,
    ),
  ],
).enableRLS();

/** One day's figures, from the provider (`polar`) or from our engine (`computed`), side by side (V36). */
export const metricSnapshot = pgTable(
  "metric_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    // Null = every product together.
    productId: uuid("product_id").references(() => product.id, { onDelete: "cascade" }),
    onDate: date("on_date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    currency: currency("currency").notNull(),
    mrrMinor: minor("mrr_minor").notNull(),
    customers: integer("customers").notNull(),
    arpaMinor: minor("arpa_minor"),
    // Anything else the provider reports, kept as it came (ratios as decimal strings).
    extra: jsonb("extra").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("metric_snapshot_day_uq").on(t.userId, t.productId, t.onDate, t.source).nullsNotDistinct(),
    check("metric_snapshot_source_ck", sql`${t.source} in ('polar', 'computed')`),
  ],
).enableRLS();

/** "MRR $5k by June", "save ₦2m" (FR-INCOME-10). */
export const goal = pgTable(
  "goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: owner(),
    kind: text("kind").notNull(),
    title: text("title").notNull().default(""),
    productId: uuid("product_id").references(() => product.id, { onDelete: "cascade" }),
    targetMinor: minor("target_minor").notNull(),
    currency: currency("currency").notNull(),
    dueOn: date("due_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("goal_kind_ck", sql`${t.kind} in ('mrr', 'save')`)],
).enableRLS();
