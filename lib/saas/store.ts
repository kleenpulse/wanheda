import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { billingEvent, connector, metricSnapshot, mrrMovement, processedEvent, product } from "@/lib/db/schema";
import { CATEGORY_COLORS } from "@/lib/money/categories";
import {
  parsePolarConfig,
  sealedSecretSchema,
  tokenHint,
  type ConnectorSecret,
  type ConnectorView,
  type PolarConfig,
  type Product,
  type ProductColor,
  type ProductWrite,
} from "./connectors";
import type { Movement } from "./mrr";
import type { BillingEventInput } from "./polar/events";
import { seal, unseal } from "./seal";

// Connector, product and billing-event persistence (T40). Owner-facing calls
// take the owner's id from requireOwner() (SPEC V7). The webhook has no
// session: it finds its owner through the connector row in the URL, and only
// after the signature checked out (V34). Secrets are sealed here and nowhere
// else (V33); nothing this module returns to a page holds one.

type ConnectorRow = typeof connector.$inferSelect;

const INSERT_CHUNK = 100;

function toProduct(row: typeof product.$inferSelect): Product {
  const color = (CATEGORY_COLORS as readonly string[]).includes(row.color) ? (row.color as ProductColor) : "slate";
  return { id: row.id, name: row.name, url: row.url, color };
}

function openSecret(row: ConnectorRow, key: Uint8Array): ConnectorSecret | null {
  const plain = unseal(row.sealedSecret, row.id, key);
  if (plain === null) return null;
  try {
    const parsed = sealedSecretSchema.safeParse(JSON.parse(plain));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function sealSecret(id: string, secret: ConnectorSecret, key: Uint8Array): string {
  return seal(JSON.stringify(secret), id, key);
}

function toView(row: ConnectorRow, key: Uint8Array, products: readonly Product[]): ConnectorView {
  const config = parsePolarConfig(row.config);
  const secret = openSecret(row, key);
  const known = new Set(products.map((p) => p.id));
  return {
    id: row.id,
    provider: "polar",
    server: config.server,
    organizationId: config.organizationId,
    // A mapping onto an archived product is dropped from view (and ignored by the engine).
    productMap: Object.fromEntries(Object.entries(config.productMap).filter(([, id]) => known.has(id))),
    products: config.products,
    tokenHint: secret ? tokenHint(secret.token) : null,
    webhookSecretSet: secret?.webhookSecret != null,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
    sealBroken: secret === null,
  };
}

export async function loadConnections(userId: string, key: Uint8Array): Promise<{ connectors: ConnectorView[]; products: Product[] } | null> {
  const db = getDb();
  if (!db) return null;
  const [connectorRows, productRows] = await db.batch([
    db.select().from(connector).where(eq(connector.userId, userId)).orderBy(asc(connector.createdAt)),
    db
      .select()
      .from(product)
      .where(and(eq(product.userId, userId), eq(product.archived, false)))
      .orderBy(asc(product.createdAt)),
  ]);
  const products = productRows.map(toProduct);
  return { connectors: connectorRows.map((row) => toView(row, key, products)), products };
}

export async function saveProduct(userId: string, w: ProductWrite): Promise<Product | "not-yours" | null> {
  const db = getDb();
  if (!db) return null;
  const values = { name: w.name, url: w.url, color: w.color };
  const rows = await db
    .insert(product)
    .values({ id: w.id, userId, ...values })
    .onConflictDoUpdate({ target: product.id, set: { ...values, archived: false, updatedAt: sql`now()` }, setWhere: eq(product.userId, userId) })
    .returning();
  return rows[0] ? toProduct(rows[0]) : "not-yours";
}

/** Archived, not deleted: its MRR history stays, and the engine stops counting it (V35). */
export async function archiveProduct(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db
    .update(product)
    .set({ archived: true })
    .where(and(eq(product.id, id), eq(product.userId, userId)));
  return true;
}

export async function createPolarConnector(
  userId: string,
  input: { id: string; token: string; config: PolarConfig },
  key: Uint8Array,
): Promise<"created" | "exists" | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .insert(connector)
    .values({
      id: input.id,
      userId,
      provider: "polar",
      sealedSecret: sealSecret(input.id, { token: input.token, webhookSecret: null }, key),
      config: input.config,
      lastError: null,
    })
    .onConflictDoNothing({ target: connector.id })
    .returning({ id: connector.id });
  return rows.length > 0 ? "created" : "exists";
}

async function ownedConnector(userId: string, id: string): Promise<ConnectorRow | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(connector)
    .where(and(eq(connector.id, id), eq(connector.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The unsealed half of a connector: what server and products it uses. Readable even when the secret isn't. */
export async function connectorConfig(userId: string, id: string): Promise<PolarConfig | "missing" | null> {
  const row = await ownedConnector(userId, id);
  if (row === null) return getDb() ? "missing" : null;
  return parsePolarConfig(row.config);
}

export type SecretPatchOutcome = "saved" | "missing" | "broken";

/**
 * Replaces the token or sets the webhook secret. The other half is kept, so
 * the blob is opened first; a blob that won't open (seal key changed) can only
 * be fixed by entering a new token, which starts a fresh blob.
 */
export async function patchConnectorSecret(
  userId: string,
  id: string,
  patch: { token: string } | { webhookSecret: string },
  key: Uint8Array,
): Promise<SecretPatchOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const row = await ownedConnector(userId, id);
  if (!row) return "missing";
  const current = openSecret(row, key);
  let next: ConnectorSecret;
  if ("token" in patch) next = { token: patch.token, webhookSecret: current?.webhookSecret ?? null };
  else if (current) next = { token: current.token, webhookSecret: patch.webhookSecret };
  else return "broken";
  await db
    .update(connector)
    .set({ sealedSecret: sealSecret(id, next, key), lastError: null })
    .where(and(eq(connector.id, id), eq(connector.userId, userId)));
  return "saved";
}

export type MapOutcome = { kind: "saved"; productMap: Record<string, string> } | { kind: "missing" } | { kind: "not-yours" };

export async function setProductMap(userId: string, id: string, edit: Record<string, string | null>): Promise<MapOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const targets = [...new Set(Object.values(edit).filter((v): v is string => v !== null))];
  const [rows, owned] = await db.batch([
    db
      .select()
      .from(connector)
      .where(and(eq(connector.id, id), eq(connector.userId, userId)))
      .limit(1),
    db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.userId, userId), eq(product.archived, false))),
  ]);
  const row = rows[0];
  if (!row) return { kind: "missing" };
  const ownedIds = new Set(owned.map((p) => p.id));
  if (targets.some((t) => !ownedIds.has(t))) return { kind: "not-yours" };
  // The merge runs in SQL on the row as it is now, so two edits in flight (two
  // tabs) both land instead of the later one replacing the earlier one's map.
  const adds = Object.fromEntries(Object.entries(edit).filter((entry): entry is [string, string] => entry[1] !== null));
  const removed = Object.keys(edit).filter((key) => edit[key] === null);
  const merged = sql`(coalesce(${connector.config} -> 'productMap', '{}'::jsonb) || ${JSON.stringify(adds)}::jsonb) - array(select jsonb_array_elements_text(${JSON.stringify(removed)}::jsonb))`;
  const updated = await db
    .update(connector)
    .set({ config: sql`jsonb_set(${connector.config}, '{productMap}', ${merged})` })
    .where(and(eq(connector.id, id), eq(connector.userId, userId)))
    .returning({ config: connector.config });
  return { kind: "saved", productMap: parsePolarConfig(updated[0]?.config ?? row.config).productMap };
}

/** The owner's connector ids, oldest first. */
export async function connectorIds(userId: string): Promise<string[] | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ id: connector.id }).from(connector).where(eq(connector.userId, userId)).orderBy(asc(connector.createdAt));
  return rows.map((r) => r.id);
}

/** Its billing events and processed deliveries go with it (cascade). */
export async function deleteConnector(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(connector).where(and(eq(connector.id, id), eq(connector.userId, userId)));
  return true;
}

export interface OpenConnector {
  id: string;
  userId: string;
  secret: ConnectorSecret;
  config: PolarConfig;
}

/** For the webhook and the sync: the connector with its secret open, `broken` if the blob won't open, null if absent. */
export async function openConnector(id: string, key: Uint8Array, userId?: string): Promise<OpenConnector | "broken" | null> {
  const db = getDb();
  if (!db) return null;
  const where = userId ? and(eq(connector.id, id), eq(connector.userId, userId)) : eq(connector.id, id);
  const rows = await db.select().from(connector).where(where).limit(1);
  const row = rows[0];
  if (!row) return null;
  const secret = openSecret(row, key);
  if (!secret) return "broken";
  return { id: row.id, userId: row.userId, secret, config: parsePolarConfig(row.config) };
}

function eventValues(c: Pick<OpenConnector, "id" | "userId">, e: BillingEventInput) {
  return {
    userId: c.userId,
    connectorId: c.id,
    eventId: e.eventId,
    kind: e.kind,
    occurredAt: e.occurredAt,
    objectId: e.objectId,
    providerProductId: e.providerProductId,
    customerRef: e.customerRef,
    subscriptionRef: e.subscriptionRef,
    orderRef: e.orderRef,
    payload: e.payload,
  };
}

/**
 * One webhook delivery, in one transaction (V34): the delivery id goes into
 * processed_event and the event into billing_event together, so a crash
 * between them can't mark a delivery done that was never stored. A repeat
 * delivery hits both unique keys and changes nothing.
 */
export async function recordDelivery(c: Pick<OpenConnector, "id" | "userId">, deliveryId: string, event: BillingEventInput | null): Promise<"new" | "duplicate" | null> {
  const db = getDb();
  if (!db) return null;
  const mark = db
    .insert(processedEvent)
    .values({ userId: c.userId, connectorId: c.id, eventId: deliveryId })
    .onConflictDoNothing({ target: [processedEvent.connectorId, processedEvent.eventId] })
    .returning({ id: processedEvent.id });
  if (!event) {
    const marked = await mark;
    return marked.length > 0 ? "new" : "duplicate";
  }
  const [marked] = await db.batch([
    mark,
    db
      .insert(billingEvent)
      .values(eventValues(c, event))
      .onConflictDoNothing({ target: [billingEvent.connectorId, billingEvent.eventId] }),
  ]);
  return marked.length > 0 ? "new" : "duplicate";
}

/** Pulled snapshots. Their ids name the state, so a repeat pull inserts nothing (V34). Returns how many were new. */
export async function insertEvents(c: Pick<OpenConnector, "id" | "userId">, events: readonly BillingEventInput[]): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  let added = 0;
  for (let i = 0; i < events.length; i += INSERT_CHUNK) {
    const rows = await db
      .insert(billingEvent)
      .values(events.slice(i, i + INSERT_CHUNK).map((e) => eventValues(c, e)))
      .onConflictDoNothing({ target: [billingEvent.connectorId, billingEvent.eventId] })
      .returning({ id: billingEvent.id });
    added += rows.length;
  }
  return added;
}

/** After a test call or a sync: what Polar listed, and how it went. */
export async function markConnector(
  id: string,
  outcome:
    | { ok: true; products?: PolarConfig["products"]; organizationId?: string | null; synced: boolean; warning?: string }
    | { ok: false; error: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (!outcome.ok) {
    await db.update(connector).set({ lastError: outcome.error }).where(eq(connector.id, id));
    return;
  }
  // A top-level jsonb merge, so a mapping edit landing meanwhile keeps its productMap.
  const patch = {
    ...(outcome.products ? { products: outcome.products } : {}),
    ...(outcome.organizationId !== undefined ? { organizationId: outcome.organizationId } : {}),
  };
  await db
    .update(connector)
    .set({
      lastError: outcome.warning ?? null,
      ...(outcome.synced ? { lastSyncedAt: new Date() } : {}),
      config: sql`${connector.config} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(connector.id, id));
}

export type StoredBillingEvent = BillingEventInput & { id: string };

/** Every event of one connector, in fold order (V34). */
export async function loadEvents(connectorId: string): Promise<StoredBillingEvent[] | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(billingEvent)
    .where(eq(billingEvent.connectorId, connectorId))
    .orderBy(asc(billingEvent.occurredAt), asc(billingEvent.eventId));
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    kind: r.kind as StoredBillingEvent["kind"],
    occurredAt: r.occurredAt,
    objectId: r.objectId,
    providerProductId: r.providerProductId,
    customerRef: r.customerRef,
    subscriptionRef: r.subscriptionRef,
    orderRef: r.orderRef,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));
}

export interface ReconcileFacts {
  userId: string;
  config: PolarConfig;
  /** Every product of the owner, archived ones too (their history stays, V35). */
  products: { id: string; name: string; archived: boolean }[];
}

/** What reconcile() needs besides the log: whose connector it is, its product map, and the products. */
export async function loadReconcileFacts(connectorId: string): Promise<ReconcileFacts | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ userId: connector.userId, config: connector.config }).from(connector).where(eq(connector.id, connectorId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const products = await db
    .select({ id: product.id, name: product.name, archived: product.archived })
    .from(product)
    .where(eq(product.userId, row.userId))
    .orderBy(asc(product.createdAt));
  return { userId: row.userId, config: parsePolarConfig(row.config), products };
}

/** A stable uuid for a movement key, so a rebuild writes the same ids (V35). */
export function movementId(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  // RFC 9562 version 8 (custom), variant 10.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((Number.parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export interface SnapshotWrite {
  productId: string | null;
  onDate: string;
  source: "polar" | "computed";
  currency: string;
  mrrMinor: number;
  customers: number;
  arpaMinor: number | null;
  extra: Record<string, unknown>;
}

const snapshotUpsert = {
  target: [metricSnapshot.userId, metricSnapshot.productId, metricSnapshot.onDate, metricSnapshot.source],
  set: {
    currency: sql`excluded.currency`,
    mrrMinor: sql`excluded.mrr_minor`,
    customers: sql`excluded.customers`,
    arpaMinor: sql`excluded.arpa_minor`,
    extra: sql`excluded.extra`,
    updatedAt: sql`now()`,
  },
};

/** One row per (product, day, source); a later figure for the same day replaces the earlier one. */
export async function upsertSnapshots(userId: string, rows: readonly SnapshotWrite[]): Promise<void> {
  const db = getDb();
  if (!db || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db
      .insert(metricSnapshot)
      .values(rows.slice(i, i + INSERT_CHUNK).map((r) => ({ userId, ...r })))
      .onConflictDoUpdate(snapshotUpsert);
  }
}

/**
 * Writes everything reconcile() derives from one connector's log, in one
 * transaction (neon-http batch), V35: every movement of the connector is
 * replaced and the computed snapshots upserted. The first statement takes a
 * per-connector advisory lock, so two runs never interleave (a burst of
 * webhooks queues one run each): the second one's delete sees the first one's
 * rows. Which run lands last is up to the caller (reconcile re-checks the log).
 */
export async function writeDerived(connectorId: string, userId: string, movements: readonly Movement[], snapshots: readonly SnapshotWrite[]): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const lock = db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`reconcile:${connectorId}`}, 0))`);
  const remove = db
    .delete(mrrMovement)
    .where(inArray(mrrMovement.billingEventId, db.select({ id: billingEvent.id }).from(billingEvent).where(eq(billingEvent.connectorId, connectorId))));
  const writes = [];
  for (let i = 0; i < movements.length; i += INSERT_CHUNK) {
    writes.push(
      db.insert(mrrMovement).values(
        movements.slice(i, i + INSERT_CHUNK).map((m) => ({
          id: movementId(m.key),
          userId,
          productId: m.productId,
          occurredAt: m.occurredAt,
          customerRef: m.customerRef,
          kind: m.kind,
          deltaMrrMinor: m.deltaMrrMinor,
          currency: m.currency,
          billingEventId: m.billingEventId,
        })),
      ),
    );
  }
  for (let i = 0; i < snapshots.length; i += INSERT_CHUNK) {
    writes.push(
      db
        .insert(metricSnapshot)
        .values(snapshots.slice(i, i + INSERT_CHUNK).map((r) => ({ userId, ...r })))
        .onConflictDoUpdate(snapshotUpsert),
    );
  }
  await db.batch([lock, remove, ...writes]);
  return true;
}

/** How many events one connector's log holds: append-only, so a bigger count means a newer log. */
export async function countEvents(connectorId: string): Promise<number | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(billingEvent).where(eq(billingEvent.connectorId, connectorId));
  return rows[0]?.n ?? 0;
}
