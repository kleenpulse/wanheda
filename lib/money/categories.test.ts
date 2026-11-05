import { describe, expect, it } from "vitest";
import { aliasesOf, CATEGORY_COLORS, DEFAULT_CATEGORIES, isCategoryColor, isCategoryKind } from "./categories";

describe("DEFAULT_CATEGORIES (V29)", () => {
  const bySlug = new Map(DEFAULT_CATEGORIES.map((c) => [c.slug, c]));

  it("has unique slugs and names", () => {
    expect(bySlug.size).toBe(DEFAULT_CATEGORIES.length);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase())).size).toBe(DEFAULT_CATEGORIES.length);
  });

  it("is two levels deep at most, a child under a top-level parent of its own kind", () => {
    for (const c of DEFAULT_CATEGORIES) {
      if (c.parent === undefined) continue;
      const parent = bySlug.get(c.parent);
      expect(parent, c.slug).toBeDefined();
      expect(parent?.parent, c.slug).toBeUndefined();
      expect(parent?.kind, c.slug).toBe(c.kind);
    }
  });

  it("uses data palette colours only, never the signal hue", () => {
    expect(DEFAULT_CATEGORIES.every((c) => isCategoryColor(c.color))).toBe(true);
    expect(CATEGORY_COLORS).not.toContain("signal");
  });

  it("has an expense and an income fallback, and one transfer", () => {
    expect(bySlug.get("other")?.kind).toBe("expense");
    expect(bySlug.get("income-other")?.kind).toBe("income");
    expect(DEFAULT_CATEGORIES.filter((c) => c.kind === "transfer").map((c) => c.slug)).toEqual(["transfer"]);
  });

  it("never gives one quick-add alias to two categories", () => {
    const seen = new Map<string, string>();
    for (const c of DEFAULT_CATEGORIES) {
      for (const a of c.aliases ?? []) {
        expect(seen.get(a), `alias "${a}" on ${c.slug}`).toBeUndefined();
        seen.set(a, c.slug);
      }
    }
  });
});

describe("guards and aliases", () => {
  it("accepts only known colours and kinds", () => {
    expect(isCategoryColor("blue")).toBe(true);
    expect(isCategoryColor("pink")).toBe(false);
    expect(isCategoryColor(3)).toBe(false);
    expect(isCategoryKind("income")).toBe(true);
    expect(isCategoryKind("savings")).toBe(false);
    expect(isCategoryKind(null)).toBe(false);
  });

  it("finds a seeded category's aliases by slug; user categories have none", () => {
    expect(aliasesOf("food")).toContain("chop");
    expect(aliasesOf("not-a-slug")).toEqual([]);
    expect(aliasesOf(null)).toEqual([]);
  });
});
