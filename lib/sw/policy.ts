import { isPublicPath } from "@/lib/auth/gate";

// What the service worker (lib/sw/worker.ts, T91, ADR-0016) does with each
// request, with no IO, so every branch is unit-tested. The worker opens a
// cold start with the network off from the last copy of each page, and the
// build assets those pages load.

/** Bump to drop every cache a previous worker made (activate deletes unknown names). */
export const CACHE_VERSION = 1;
export const CACHE_PREFIX = "wanheda-";
export const STATIC_CACHE = `${CACHE_PREFIX}static-v${CACHE_VERSION}`;
export const PAGES_CACHE = `${CACHE_PREFIX}pages-v${CACHE_VERSION}`;
/** Holds one entry: the account whose pages are in PAGES_CACHE. */
export const META_CACHE = `${CACHE_PREFIX}meta-v${CACHE_VERSION}`;
export const OWNED_CACHES: ReadonlySet<string> = new Set([STATIC_CACHE, PAGES_CACHE, META_CACHE]);
export const ACCOUNT_KEY = "/__wanheda-sw/account";

/** Hashed build files: a deploy adds new names, so old ones are trimmed oldest first. */
export const MAX_STATIC = 600;
export const MAX_PAGES = 40;
/** A navigation slower than this shows the saved copy (if any) while the network finishes in the background. */
export const PAGE_TIMEOUT_MS = 3000;

export type RequestKind = "static" | "page" | "pass";

export interface RequestFacts {
  url: string;
  /** The worker's own origin. */
  origin: string;
  method: string;
  mode: string;
}

/**
 * "static": `/_next/static/*`, cache first (content-hashed, never changes).
 * "page": a same-origin navigation to a signed-in page, network first.
 * "pass": everything else goes to the network untouched: API calls, server
 * actions, RSC fetches, auth pages, other sites.
 */
export function routeRequest({ url, origin, method, mode }: RequestFacts): RequestKind {
  if (method !== "GET") return "pass";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "pass";
  }
  if (parsed.origin !== origin) return "pass";
  const path = parsed.pathname;
  if (path.startsWith("/_next/static/")) return "static";
  if (mode !== "navigate") return "pass";
  if (neverCached(path)) return "pass";
  return "page";
}

/** Sign-in, the desktop handoff, APIs and Next internals are never kept. */
function neverCached(path: string): boolean {
  return (
    isPublicPath(path) ||
    path === "/api" ||
    path.startsWith("/api/") ||
    path === "/desktop" ||
    path.startsWith("/desktop/") ||
    path.startsWith("/_next/") ||
    path === "/sw.js"
  );
}

/** The key a page is saved under: the URL without its fragment. */
export function pageKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}

export interface ResponseFacts {
  status: number;
  type: string;
  redirected: boolean;
  contentType: string | null;
}

/** Only a whole, same-origin HTML page is saved: never a redirect (to /login, say) or an error. */
export function pageCacheable({ status, type, redirected, contentType }: ResponseFacts): boolean {
  return status === 200 && type === "basic" && !redirected && (contentType ?? "").toLowerCase().startsWith("text/html");
}

/** A build file is saved only whole (a 206 range reply can't be cached). */
export function staticCacheable({ status, type }: Pick<ResponseFacts, "status" | "type">): boolean {
  return status === 200 && type === "basic";
}

/** How many of the oldest entries to delete so `count` fits under `max`. */
export function overflow(count: number, max: number): number {
  return Math.max(0, count - max);
}

/** The page-side messages the worker accepts. */
export type WorkerMessage = { type: "account"; scope: string | null };

/** The account message, checked; anything else is ignored. Scope names come from lib/device/scope.ts. */
export function parseWorkerMessage(data: unknown): WorkerMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== "account") return null;
  const scope = record.scope;
  if (scope === null) return { type: "account", scope: null };
  if (typeof scope === "string" && scope.length > 0 && scope.length <= 200) return { type: "account", scope };
  return null;
}

const SIGNED_OUT = "signed-out";

/** The marker's text for an account (signed out has its own, so it never matches a user). */
export function accountMarker(scope: string | null): string {
  return scope === null ? SIGNED_OUT : `account:${scope}`;
}

/**
 * Whether the saved pages must go when the marker moves from `previous` (null:
 * none yet) to `next`. Sign-out always clears them. Pages saved while signed out
 * (or before the first report) can only be the next account's, since the old
 * session was already gone, so they are adopted: wiping them would race the
 * new account's first page. Only one account replacing another clears.
 */
export function wipesPages(previous: string | null, next: string): boolean {
  if (next === SIGNED_OUT) return true;
  if (previous === null || previous === SIGNED_OUT) return false;
  return previous !== next;
}
