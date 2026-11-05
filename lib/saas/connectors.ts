import { z } from "zod";
import { CATEGORY_COLORS, type CategoryColor } from "@/lib/money/categories";
import { POLAR_SERVERS, type PolarServer } from "./polar/client";

// Connectors and products (FR-INCOME-2, 3; FRD 4.5). Pure: shapes, schemas and
// the read model the settings screen renders. What crosses to the client never
// holds a secret, only whether one is set and the token's last four (SPEC V33).

export const PRODUCT_COLORS = CATEGORY_COLORS;
export type ProductColor = CategoryColor;

/** What the sealed blob holds. One blob per connector, so one unseal reads both. */
export const sealedSecretSchema = z
  .object({
    token: z.string().min(1).max(500),
    webhookSecret: z.string().min(1).max(500).nullable(),
  })
  .strict();
export type ConnectorSecret = z.infer<typeof sealedSecretSchema>;

export const polarProductRefSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  recurring: z.boolean(),
  archived: z.boolean(),
});
export type PolarProductRef = z.infer<typeof polarProductRefSchema>;

/** `connector.config` for Polar. Parsed field-wise on read, so an old row never breaks the screen. */
export const polarConfigSchema = z.object({
  server: z.enum(POLAR_SERVERS).catch("production"),
  organizationId: z.string().nullable().catch(null),
  /** Polar product id → Wanheda product id. Unmapped products are ignored by the engine. */
  productMap: z.record(z.string(), z.uuid()).catch({}),
  /** The Polar products seen at the last test or sync, for the mapping screen. */
  products: z.array(polarProductRefSchema).catch([]),
});
export type PolarConfig = z.infer<typeof polarConfigSchema>;

export function parsePolarConfig(raw: unknown): PolarConfig {
  return polarConfigSchema.parse(typeof raw === "object" && raw !== null ? raw : {});
}

export interface ConnectorView {
  id: string;
  provider: "polar";
  server: PolarServer;
  organizationId: string | null;
  productMap: Record<string, string>;
  products: PolarProductRef[];
  tokenHint: string | null;
  webhookSecretSet: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** The secret couldn't be opened (key changed or blob damaged): the owner must re-enter it. */
  sealBroken: boolean;
}

export interface Product {
  id: string;
  name: string;
  url: string;
  color: ProductColor;
}

export interface ConnectionsPayload {
  /** False ⇒ no seal key or no database: connectors are off and Income shows sample data. */
  available: boolean;
  demo: boolean;
  connectors: ConnectorView[];
  products: Product[];
  /** `${origin}/api/webhooks/polar/<id>` needs the origin; the client adds it. */
  webhookPath: string;
}

export const CONNECTIONS_KEY = ["connections"] as const;
export const WEBHOOK_PATH = "/api/webhooks/polar";

/** "••••abcd": never more of a token than its last four. */
export function tokenHint(token: string): string {
  return token.length <= 8 ? "••••" : `••••${token.slice(-4)}`;
}

export const productWriteSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(60),
    url: z
      .string()
      .trim()
      .max(200)
      .refine((u) => u === "" || /^https?:\/\/[^\s]+$/.test(u), "http(s) URL or empty"),
    color: z.enum(PRODUCT_COLORS),
  })
  .strict();
export type ProductWrite = z.infer<typeof productWriteSchema>;

export const addPolarSchema = z
  .object({
    id: z.uuid(),
    server: z.enum(POLAR_SERVERS),
    token: z.string().trim().min(10).max(500),
  })
  .strict();

export const webhookSecretSchema = z
  .object({ id: z.uuid(), secret: z.string().trim().min(10).max(500) })
  .strict();

export const replaceTokenSchema = z
  .object({ id: z.uuid(), token: z.string().trim().min(10).max(500) })
  .strict();

export const productMapSchema = z
  .object({
    id: z.uuid(),
    // Polar product id → Wanheda product id, or null to unmap.
    map: z.record(z.string().min(1).max(200), z.uuid().nullable()),
  })
  .strict();

/** Applies a mapping edit: null unmaps, ids not in the edit keep their mapping. */
export function mergeProductMap(current: Record<string, string>, edit: Record<string, string | null>): Record<string, string> {
  const merged = Object.entries({ ...current, ...edit }).filter((entry): entry is [string, string] => entry[1] !== null);
  return Object.fromEntries(merged);
}
