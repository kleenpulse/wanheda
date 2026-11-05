import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => null }));

const { removalFor, windowStart, loadMoney, saveTxn, deleteTxn, removeCategory } = await import("./store");

describe("money store", () => {
  it("archives seeded rows and deletes only the owner's own (V29)", () => {
    expect(removalFor({ slug: "food" })).toBe("archive");
    expect(removalFor({ slug: "cash" })).toBe("archive");
    expect(removalFor({ slug: null })).toBe("delete");
  });

  it("loads this month and the two before", () => {
    expect(windowStart("2026-11-05")).toBe("2026-09-01");
    expect(windowStart("2026-01-31")).toBe("2025-11-01");
  });

  it("never throws without a database (V9)", async () => {
    expect(await loadMoney("u")).toEqual({ kind: "failed" });
    expect(await saveTxn("u", {} as never)).toBeNull();
    expect(await deleteTxn("u", "x")).toBeNull();
    expect(await removeCategory("u", "x")).toBeNull();
  });
});
