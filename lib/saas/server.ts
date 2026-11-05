import "server-only";
import type { Owner } from "@/lib/auth/owner";
import { connectorSealKey, has } from "@/lib/capabilities";
import { WEBHOOK_PATH, type ConnectionsPayload, type PolarProductRef } from "./connectors";
import { describePolarError, polarClient, type PolarClient, type PolarProduct, type PolarServer } from "./polar/client";
import { fromPull, type BillingEventInput, type BillingKind } from "./polar/events";
import { reconcile } from "./reconcile";
import { DEMO_PRODUCTS } from "./seed";
import { polarSnapshots, snapshotDays } from "./snapshots";
import { insertEvents, loadConnections, loadReconcileFacts, markConnector, openConnector, upsertSnapshots, type SnapshotWrite } from "./store";

// Income connectors, server side (T40). Reads for the settings screen, the
// token test, and the pull sync that feeds the same reconcile() the webhook
// does (FRD 4.5: one writer).


export async function connectionsFor(owner: Owner): Promise<ConnectionsPayload | null> {
  const base = { webhookPath: WEBHOOK_PATH };
  if (owner.kind === "demo") return { ...base, available: false, demo: true, connectors: [], products: [...DEMO_PRODUCTS] };
  const key = connectorSealKey();
  if (!has("connectors") || !key) return { ...base, available: false, demo: false, connectors: [], products: [] };
  const loaded = await loadConnections(owner.user.id, key);
  return loaded ? { ...base, available: true, demo: false, ...loaded } : null;
}

export function productRefs(products: readonly PolarProduct[]): PolarProductRef[] {
  return products.map((p) => ({ id: p.id, name: p.name, recurring: p.is_recurring ?? false, archived: p.is_archived ?? false }));
}

export type TokenCheck = { ok: true; products: PolarProductRef[]; organizationId: string | null } | { ok: false; error: string };

/** One cheap call before a token is saved, so a typo never becomes a connector. */
export async function checkPolarToken(server: PolarServer, token: string, client: PolarClient = polarClient({ server, token })): Promise<TokenCheck> {
  try {
    const products = await client.products();
    return { ok: true, products: productRefs(products), organizationId: products[0]?.organization_id ?? null };
  } catch (error) {
    return { ok: false, error: describePolarError(error) };
  }
}

const PULLS: readonly [BillingKind, "/v1/subscriptions/" | "/v1/orders/" | "/v1/refunds/"][] = [
  ["subscription", "/v1/subscriptions/"],
  ["order", "/v1/orders/"],
  ["refund", "/v1/refunds/"],
];

export type SyncResult =
  | { ok: true; added: number; skipped: number; products: PolarProductRef[] }
  | { ok: false; reason: "missing" | "broken" | "off" }
  | { ok: false; reason: "polar"; error: string };

/**
 * Pulls every subscription, order and refund and appends the snapshots that
 * are new (V34), then reconciles. A webhook missed while the app was down is
 * picked up here, through the same writer.
 */
export async function syncConnector(userId: string, id: string, makeClient = polarClient): Promise<SyncResult> {
  const key = connectorSealKey();
  if (!key) return { ok: false, reason: "off" };
  const c = await openConnector(id, key, userId);
  if (c === null) return { ok: false, reason: "missing" };
  if (c === "broken") return { ok: false, reason: "broken" };
  const client = makeClient({ server: c.config.server, token: c.secret.token });
  try {
    const products = productRefs(await client.products());
    const events: BillingEventInput[] = [];
    let skipped = 0;
    for (const [kind, path] of PULLS) {
      for (const item of await client.listAll(path)) {
        const event = fromPull(kind, item);
        if (event) events.push(event);
        else skipped++;
      }
    }
    const added = (await insertEvents(c, events)) ?? 0;
    await reconcile(c.id);
    const warning = await pullPolarMetrics(c.id, client);
    await markConnector(c.id, { ok: true, products, synced: true, ...(warning ? { warning } : {}) });
    return { ok: true, added, skipped, products };
  } catch (error) {
    const message = describePolarError(error);
    await markConnector(c.id, { ok: false, error: message });
    return { ok: false, reason: "polar", error: message };
  }
}

/**
 * Polar's own daily figures for the last 30 days, per mapped product and for
 * the whole organization, stored beside ours (V36). A failure here never
 * fails the sync: the events are in; the parity readout just waits. Returns a
 * line for `last_error` when Polar's figures couldn't be read.
 */
export async function pullPolarMetrics(connectorId: string, client: PolarClient, now = new Date()): Promise<string | null> {
  const facts = await loadReconcileFacts(connectorId);
  if (!facts) return null;
  const days = snapshotDays(now);
  const range = { startDate: days[0] ?? "", endDate: days.at(-1) ?? "" };
  const live = facts.products.filter((p) => !p.archived);
  const scopes: { productId: string | null; polarIds: string[] }[] = [
    { productId: null, polarIds: [] },
    ...live.flatMap((p) => {
      const polarIds = Object.entries(facts.config.productMap).flatMap(([polarId, id]) => (id === p.id ? [polarId] : []));
      return polarIds.length > 0 ? [{ productId: p.id, polarIds }] : [];
    }),
  ];
  try {
    const rows: SnapshotWrite[] = [];
    for (const scope of scopes) {
      const metricDays = await client.metrics({ ...range, productIds: scope.polarIds });
      rows.push(...polarSnapshots(metricDays, scope.productId));
    }
    await upsertSnapshots(facts.userId, rows);
    return null;
  } catch (error) {
    return `Synced, but Polar's own figures couldn't be read: ${describePolarError(error)}`;
  }
}
