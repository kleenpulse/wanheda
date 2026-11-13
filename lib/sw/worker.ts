// The service worker (T91, ADR-0016). Bundled by scripts/build-sw.ts into
// public/sw.js (ignored, never tracked: no .js file may be). The decisions live
// in ./policy.ts; this file is only the event glue.
//
// Pages: network first (with navigation preload). Offline, on a 5xx, or slower
// than PAGE_TIMEOUT_MS, the last copy of that page is shown; a page never
// opened before falls back to the saved home page. Build files: cache first.
// Saved pages belong to one account: when the shell reports a different one
// (or sign-out), they are deleted before anything else is served.
//
// Kill switch: deploy a worker whose install handler calls
// `self.registration.unregister()` and deletes every `wanheda-*` cache.

import {
  ACCOUNT_KEY,
  CACHE_PREFIX,
  MAX_PAGES,
  MAX_STATIC,
  META_CACHE,
  OWNED_CACHES,
  PAGES_CACHE,
  PAGE_TIMEOUT_MS,
  STATIC_CACHE,
  accountMarker,
  overflow,
  pageCacheable,
  pageKey,
  parseWorkerMessage,
  routeRequest,
  staticCacheable,
  wipesPages,
} from "./policy";

// The root tsconfig carries the DOM lib, which can't sit beside the WebWorker
// lib in one program, so the few service-worker types used here are declared.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  readonly preloadResponse: Promise<Response | undefined>;
  respondWith(response: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown;
}
interface WorkerScope {
  readonly location: Location;
  readonly registration: { readonly navigationPreload?: { enable(): Promise<void> } };
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  addEventListener(type: "message", listener: (event: ExtendableMessageEvent) => void): void;
}

const sw = self as unknown as WorkerScope;

sw.addEventListener("install", (event) => {
  event.waitUntil(sw.skipWaiting());
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && !OWNED_CACHES.has(name)) await caches.delete(name);
      }
      await sw.registration.navigationPreload?.enable().catch(() => undefined);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (event) => {
  const message = parseWorkerMessage(event.data);
  if (message) event.waitUntil(setAccount(message.scope));
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const kind = routeRequest({ url: request.url, origin: sw.location.origin, method: request.method, mode: request.mode });
  if (kind === "static") event.respondWith(cacheFirst(event));
  else if (kind === "page") event.respondWith(networkFirstPage(event));
});

/** The shell reports whose pages it shows; another account (or sign-out) clears the saved pages (policy.wipesPages). */
async function setAccount(scope: string | null): Promise<void> {
  const meta = await caches.open(META_CACHE);
  const marker = accountMarker(scope);
  const saved = await meta.match(ACCOUNT_KEY);
  const previous = saved ? await saved.text() : null;
  if (previous === marker) return;
  if (wipesPages(previous, marker)) await caches.delete(PAGES_CACHE);
  await meta.put(ACCOUNT_KEY, new Response(marker, { headers: { "content-type": "text/plain" } }));
}

async function cacheFirst(event: FetchEvent): Promise<Response> {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const response = await fetch(event.request);
  if (staticCacheable(response)) event.waitUntil(save(cache, event.request.url, response.clone(), MAX_STATIC));
  return response;
}

async function networkFirstPage(event: FetchEvent): Promise<Response> {
  const key = pageKey(event.request.url);
  const network = (async () => {
    const response = (await event.preloadResponse) ?? (await fetch(event.request));
    if (pageCacheable({ status: response.status, type: response.type, redirected: response.redirected, contentType: response.headers.get("content-type") })) {
      const cache = await caches.open(PAGES_CACHE);
      await save(cache, key, response.clone(), MAX_PAGES);
    }
    return response;
  })();
  // The network keeps going (and saving) after a slow reply was answered from the cache.
  event.waitUntil(network.catch(() => undefined));

  const outcome = await Promise.race([
    network.then(
      (response) => ({ kind: "response", response }) as const,
      () => ({ kind: "failed" }) as const,
    ),
    delay(PAGE_TIMEOUT_MS).then(() => ({ kind: "slow" }) as const),
  ]);

  if (outcome.kind === "response") {
    if (outcome.response.status < 500) return outcome.response;
    return (await savedPage(key, false)) ?? outcome.response;
  }
  if (outcome.kind === "slow") {
    const saved = await savedPage(key, false);
    if (saved) return saved;
    try {
      return await network;
    } catch {
      return offline(key);
    }
  }
  return offline(key);
}

/** No network: the saved page, the same page with another query, then home (as a redirect, so the URL is right). */
async function offline(key: string): Promise<Response> {
  const saved = await savedPage(key, true);
  if (saved) return saved;
  const home = new URL("/", key).href;
  if (key !== home && (await savedPage(home, false))) return Response.redirect(home, 302);
  return Response.error();
}

async function savedPage(key: string, anyQuery: boolean): Promise<Response | undefined> {
  const cache = await caches.open(PAGES_CACHE);
  return cache.match(key, { ignoreVary: true, ignoreSearch: anyQuery });
}

/** A put replaces an entry and moves it to the end, so keys() runs oldest first. */
async function save(cache: Cache, key: string, response: Response, max: number): Promise<void> {
  await cache.put(key, response);
  const keys = await cache.keys();
  const extra = overflow(keys.length, max);
  for (const old of keys.slice(0, extra)) await cache.delete(old);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
