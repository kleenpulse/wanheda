"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { connectorSealKey, has } from "@/lib/capabilities";
import { addPolarSchema, productMapSchema, productWriteSchema, replaceTokenSchema, webhookSecretSchema, type Product } from "@/lib/saas/connectors";
import { reconcile } from "@/lib/saas/reconcile";
import { checkPolarToken, syncConnector } from "@/lib/saas/server";
import { archiveProduct as archiveStoredProduct, connectorConfig, connectorIds, createPolarConnector, deleteConnector, markConnector, patchConnectorSecret, saveProduct as saveStoredProduct, setProductMap } from "@/lib/saas/store";

// Settings › Connections (T40). requireOwner() first and the owner from the
// session (SPEC V7); secrets go in sealed and never come back out (V33):
// replies carry outcomes and Polar's error text, never a token.

export type ConnectorFail = { ok: false; reason: "demo" | "off" | "invalid" | "missing" | "broken" | "failed" } | { ok: false; reason: "polar"; error: string };
export type ConnectorResult = { ok: true } | ConnectorFail;

const idSchema = z.object({ id: z.uuid() }).strict();

type Gate = { ok: true; userId: string; key: Uint8Array } | ConnectorFail;

async function gate(): Promise<Gate> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const key = connectorSealKey();
  if (!has("connectors") || !key) return { ok: false, reason: "off" };
  return { ok: true, userId: owner.user.id, key };
}

function failed(where: string, error: unknown): ConnectorFail {
  console.error(`${where} failed`, error);
  return { ok: false, reason: "failed" };
}

/** Checks the token against Polar, then stores it sealed. Nothing is saved if Polar refuses it. */
export async function addPolarConnector(input: unknown): Promise<ConnectorResult> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = addPolarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { id, server, token } = parsed.data;
  const check = await checkPolarToken(server, token);
  if (!check.ok) return { ok: false, reason: "polar", error: check.error };
  try {
    const outcome = await createPolarConnector(g.userId, { id, token, config: { server, organizationId: check.organizationId, productMap: {}, products: check.products } }, g.key);
    return outcome ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    return failed("addPolarConnector", error);
  }
}

export async function setWebhookSecret(input: unknown): Promise<ConnectorResult> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = webhookSecretSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await patchConnectorSecret(g.userId, parsed.data.id, { webhookSecret: parsed.data.secret }, g.key);
    if (!outcome) return { ok: false, reason: "failed" };
    return outcome === "saved" ? { ok: true } : { ok: false, reason: outcome };
  } catch (error) {
    return failed("setWebhookSecret", error);
  }
}

export async function replacePolarToken(input: unknown): Promise<ConnectorResult> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = replaceTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    // The config isn't sealed, so a connector whose secret won't open still knows its server.
    const config = await connectorConfig(g.userId, parsed.data.id);
    if (config === null) return { ok: false, reason: "failed" };
    if (config === "missing") return { ok: false, reason: "missing" };
    const check = await checkPolarToken(config.server, parsed.data.token);
    if (!check.ok) return { ok: false, reason: "polar", error: check.error };
    const outcome = await patchConnectorSecret(g.userId, parsed.data.id, { token: parsed.data.token }, g.key);
    if (outcome !== "saved") return outcome ? { ok: false, reason: outcome } : { ok: false, reason: "failed" };
    await markConnector(parsed.data.id, { ok: true, products: check.products, organizationId: check.organizationId, synced: false });
    return { ok: true };
  } catch (error) {
    return failed("replacePolarToken", error);
  }
}

export async function mapPolarProducts(input: unknown): Promise<ConnectorResult> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = productMapSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await setProductMap(g.userId, parsed.data.id, parsed.data.map);
    if (!outcome) return { ok: false, reason: "failed" };
    if (outcome.kind === "missing") return { ok: false, reason: "missing" };
    if (outcome.kind === "not-yours") return { ok: false, reason: "invalid" };
    return { ok: true };
  } catch (error) {
    return failed("mapPolarProducts", error);
  }
}

/** Deletes the connector and every billing event it stored. The UI asks first. */
export async function removeConnector(input: unknown): Promise<ConnectorResult> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteConnector(g.userId, parsed.data.id)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    return failed("removeConnector", error);
  }
}

export type SyncReply = { ok: true; added: number; skipped: number } | ConnectorFail;

export async function syncNow(input: unknown): Promise<SyncReply> {
  const g = await gate();
  if (!g.ok) return g;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const result = await syncConnector(g.userId, parsed.data.id);
    if (result.ok) return { ok: true, added: result.added, skipped: result.skipped };
    return result.reason === "polar" ? result : { ok: false, reason: result.reason };
  } catch (error) {
    return failed("syncNow", error);
  }
}

export type RebuildReply = { ok: true; connectors: number; movements: number } | ConnectorFail;

/** Rebuilds every derived income row from the stored billing events (V35). Same log ⇒ same rows. */
export async function rebuildIncome(): Promise<RebuildReply> {
  const g = await gate();
  if (!g.ok) return g;
  try {
    const ids = (await connectorIds(g.userId)) ?? [];
    let movements = 0;
    for (const id of ids) movements += (await reconcile(id))?.movements ?? 0;
    return { ok: true, connectors: ids.length, movements };
  } catch (error) {
    return failed("rebuildIncome", error);
  }
}

export type ProductReply = { ok: true; product: Product } | ConnectorFail;

export async function saveProduct(input: unknown): Promise<ProductReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = productWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const saved = await saveStoredProduct(owner.user.id, parsed.data);
    if (!saved) return { ok: false, reason: "failed" };
    return saved === "not-yours" ? { ok: false, reason: "invalid" } : { ok: true, product: saved };
  } catch (error) {
    return failed("saveProduct", error);
  }
}

export async function archiveProduct(input: unknown): Promise<ConnectorResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await archiveStoredProduct(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    return failed("archiveProduct", error);
  }
}
