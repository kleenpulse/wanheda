import { describe, expect, it } from "vitest";
import {
  OWNED_CACHES,
  PAGES_CACHE,
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

const ORIGIN = "https://wanheda.example";
const nav = (path: string, extra: Partial<{ method: string; mode: string; origin: string }> = {}) =>
  routeRequest({ url: `${extra.origin ?? ORIGIN}${path}`, origin: ORIGIN, method: extra.method ?? "GET", mode: extra.mode ?? "navigate" });

describe("routeRequest", () => {
  it("keeps signed-in pages, network first", () => {
    for (const path of ["/", "/money", "/money?tab=budgets", "/notes/abc", "/settings", "/reader/x/y"]) expect(nav(path)).toBe("page");
  });

  it("serves build files cache first, whatever the request mode", () => {
    expect(nav("/_next/static/chunks/abc123.js", { mode: "no-cors" })).toBe("static");
    expect(nav("/_next/static/media/font.woff2", { mode: "cors" })).toBe("static");
  });

  it("never keeps sign-in, the desktop handoff, APIs or the worker itself", () => {
    for (const path of ["/login", "/login?next=%2Fmoney", "/api/auth/session", "/api", "/api/desktop/redeem?token=x", "/desktop/sign-in?nonce=n", "/desktop", "/sw.js", "/_next/image?url=x"]) {
      expect(nav(path)).toBe("pass");
    }
  });

  it("passes writes, RSC fetches and other sites", () => {
    expect(nav("/money", { method: "POST" })).toBe("pass");
    expect(nav("/money?_rsc=abc", { mode: "cors" })).toBe("pass");
    expect(nav("/", { origin: "https://evil.example" })).toBe("pass");
    expect(nav("/_next/static/chunks/a.js", { origin: "https://cdn.example", mode: "no-cors" })).toBe("pass");
    expect(routeRequest({ url: "not a url", origin: ORIGIN, method: "GET", mode: "navigate" })).toBe("pass");
  });
});

describe("pageKey", () => {
  it("drops the fragment and keeps the query", () => {
    expect(pageKey(`${ORIGIN}/money?tab=a#row-3`)).toBe(`${ORIGIN}/money?tab=a`);
  });
});

describe("pageCacheable", () => {
  const ok = { status: 200, type: "basic", redirected: false, contentType: "text/html; charset=utf-8" };

  it("saves a whole HTML page", () => {
    expect(pageCacheable(ok)).toBe(true);
  });

  it.each([
    ["a redirect to /login", { ...ok, redirected: true }],
    ["an opaque redirect", { ...ok, status: 0, type: "opaqueredirect" }],
    ["a server error", { ...ok, status: 500 }],
    ["a 404", { ...ok, status: 404 }],
    ["JSON", { ...ok, contentType: "application/json" }],
    ["no content type", { ...ok, contentType: null }],
  ])("refuses %s", (_, facts) => {
    expect(pageCacheable(facts)).toBe(false);
  });
});

describe("staticCacheable", () => {
  it("saves only whole same-origin files", () => {
    expect(staticCacheable({ status: 200, type: "basic" })).toBe(true);
    expect(staticCacheable({ status: 206, type: "basic" })).toBe(false);
    expect(staticCacheable({ status: 200, type: "opaque" })).toBe(false);
  });
});

describe("overflow", () => {
  it("counts the oldest entries to drop", () => {
    expect(overflow(10, 40)).toBe(0);
    expect(overflow(40, 40)).toBe(0);
    expect(overflow(43, 40)).toBe(3);
  });
});

describe("parseWorkerMessage", () => {
  it("accepts an account or a sign-out", () => {
    expect(parseWorkerMessage({ type: "account", scope: "u.123" })).toEqual({ type: "account", scope: "u.123" });
    expect(parseWorkerMessage({ type: "account", scope: null })).toEqual({ type: "account", scope: null });
  });

  it.each([null, "account", { type: "other", scope: "u.1" }, { type: "account" }, { type: "account", scope: "" }, { type: "account", scope: 7 }, { type: "account", scope: "x".repeat(201) }])(
    "ignores %j",
    (data) => {
      expect(parseWorkerMessage(data)).toBeNull();
    },
  );
});

describe("accountMarker", () => {
  it("never lets signed-out match an account, even one named like it", () => {
    expect(accountMarker(null)).not.toBe(accountMarker("signed-out"));
    expect(accountMarker("u.1")).not.toBe(accountMarker("u.2"));
  });
});

describe("wipesPages", () => {
  const a = accountMarker("u.a");
  const b = accountMarker("u.b");
  const out = accountMarker(null);

  it("clears on sign-out, whoever was there", () => {
    expect(wipesPages(a, out)).toBe(true);
    expect(wipesPages(null, out)).toBe(true);
  });

  it("clears when one account replaces another (demo counts as one)", () => {
    expect(wipesPages(a, b)).toBe(true);
    expect(wipesPages(accountMarker("demo"), a)).toBe(true);
  });

  it("adopts pages saved while signed out or before the first report", () => {
    expect(wipesPages(out, a)).toBe(false);
    expect(wipesPages(null, a)).toBe(false);
  });
});

describe("cache names", () => {
  it("owns its three caches under the wanheda- prefix", () => {
    expect(OWNED_CACHES.size).toBe(3);
    for (const name of OWNED_CACHES) expect(name.startsWith("wanheda-")).toBe(true);
    expect(STATIC_CACHE).not.toBe(PAGES_CACHE);
  });
});
