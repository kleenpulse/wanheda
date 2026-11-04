import { describe, expect, it } from "vitest";
import { MODULES, SYSTEM_PAGES, isActive } from "./modules";

describe("isActive", () => {
  it("matches home only on the root", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/settings", "/")).toBe(false);
  });

  it("matches a route and its children", () => {
    expect(isActive("/money", "/money")).toBe(true);
    expect(isActive("/money/subscriptions", "/money")).toBe(true);
  });

  it("does not match a sibling that shares a prefix", () => {
    expect(isActive("/moneyx", "/money")).toBe(false);
    expect(isActive("/settingsx/a", "/settings")).toBe(false);
  });
});

describe("registry", () => {
  const all = [...MODULES, ...SYSTEM_PAGES];

  it("has unique ids and routes", () => {
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
    expect(new Set(all.map((m) => m.route)).size).toBe(all.length);
  });

  it("puts each route on exactly one active entry for its own path", () => {
    for (const m of all) {
      expect(all.filter((other) => isActive(m.route, other.route))).toEqual([m]);
    }
  });

  it("never ends a route in a static file extension (the proxy would skip it, SPEC V6)", () => {
    for (const m of all) {
      expect(m.route).not.toMatch(/\.(svg|png|jpe?g|gif|webp|avif|ico|txt|xml|woff2?)$/i);
    }
  });
});
