import { parseOwnerEmails } from "@/lib/auth/allowlist";
import { sealKeyBytes } from "@/lib/saas/seal-key";
import { parseLocation, type WeatherLocation } from "@/lib/weather/location";

// One question, one shape: "does this deployment have the credentials for X?"
// (pattern from rawstash).
//
// Not "server-only": the proxy, server components and tests all read it. Every
// check is a function, not a module constant, so env injected at runtime is
// seen; a value captured at import would bake in whatever was set first.
// None of these vars is NEXT_PUBLIC_, so server code reads them at runtime and
// one build serves demo, locked and gated by env alone. Keep it that way.

export type Capability = "db" | "auth" | "connectors" | "files";

const MIN_SECRET_LENGTH = 32;

function value(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** The pooled Neon URL, or undefined. */
export function databaseUrl(): string | undefined {
  return value(process.env.DATABASE_URL);
}

/** Where the board's weather is for, or null. Keyless (Open-Meteo), so not a capability. */
export function weatherLocation(): WeatherLocation | null {
  return parseLocation({
    latitude: process.env.WEATHER_LATITUDE,
    longitude: process.env.WEATHER_LONGITUDE,
    place: process.env.WEATHER_PLACE,
  });
}

/** The owner allowlist. Empty means nobody may sign up or in. */
export function ownerEmails(): ReadonlySet<string> {
  return parseOwnerEmails(process.env.OWNER_EMAILS);
}

/** The key that seals connector secrets (SPEC V33), or null if unset or malformed. */
export function connectorSealKey(): Uint8Array | null {
  return sealKeyBytes(process.env.CONNECTOR_SEAL_KEY);
}

export interface R2Settings {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** The reader's R2 bucket (SPEC V38), or null unless all four parts are set. */
export function r2Settings(): R2Settings | null {
  const accountId = value(process.env.R2_ACCOUNT_ID);
  const accessKeyId = value(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = value(process.env.R2_SECRET_ACCESS_KEY);
  const bucket = value(process.env.R2_BUCKET);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export interface AuthSettings {
  secret: string;
  baseURL: string | undefined;
  githubClientId: string;
  githubClientSecret: string;
  owners: ReadonlySet<string>;
}

/**
 * Everything Better Auth needs, or null if any part is missing. A short
 * secret or an empty allowlist counts as missing (fail closed, SPEC V6).
 */
export function authSettings(): AuthSettings | null {
  const secret = value(process.env.BETTER_AUTH_SECRET);
  const githubClientId = value(process.env.GITHUB_CLIENT_ID);
  const githubClientSecret = value(process.env.GITHUB_CLIENT_SECRET);
  const owners = ownerEmails();
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  if (!githubClientId || !githubClientSecret) return null;
  if (owners.size === 0) return null;
  return {
    secret,
    baseURL: value(process.env.BETTER_AUTH_URL),
    githubClientId,
    githubClientSecret,
    owners,
  };
}

const PREDICATES: Record<Capability, () => boolean> = {
  db: () => databaseUrl() !== undefined,
  // Better Auth stores users and sessions in the database, so auth needs both.
  auth: () => PREDICATES.db() && authSettings() !== null,
  // Billing connectors keep sealed secrets in the database, so they need both.
  connectors: () => PREDICATES.db() && connectorSealKey() !== null,
  // Reader files in R2 (V38). Rows live in the database, so it needs both.
  // Off means local-only: file bytes stay in each device's OPFS.
  files: () => PREDICATES.db() && r2Settings() !== null,
};

/** Is this capability configured? Sync, never throws. */
export function has(capability: Capability): boolean {
  return PREDICATES[capability]();
}

export type GateMode = "demo" | "locked" | "gated";

/**
 * The single access rule (FRD D3, SPEC V6). `proxy.ts` and `requireOwner()`
 * both call it, so they cannot drift apart.
 *
 * - gated:  auth is configured; signed-out requests go to /login.
 * - locked: real data is reachable but auth is not configured; every route 503s.
 * - demo:   no real data and no auth; the app is open and shows seed data.
 *
 * Today the database is the only source of real data. Any later connector that
 * serves real data without the database must join `holdsRealData()`, or demo
 * mode would show that data to anyone.
 */
export function gateMode(): GateMode {
  if (has("auth")) return "gated";
  if (holdsRealData()) return "locked";
  return "demo";
}

function holdsRealData(): boolean {
  return has("db");
}
