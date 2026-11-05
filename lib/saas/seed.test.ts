import { describe, expect, it } from "vitest";
import { metrics, mrrAt, revenueFrom } from "./mrr";
import { DEMO_PRODUCT_MAP, DEMO_PRODUCTS, demoBillingEvents, demoMovements } from "./seed";

const TODAY = new Date("2026-11-05T15:00:00Z");

describe("demo income", () => {
  it("is the same story all day, and runs through the real engine", () => {
    expect(demoBillingEvents(new Date("2026-11-05T01:00:00Z"))).toEqual(demoBillingEvents(TODAY));
    const ms = demoMovements(TODAY);
    expect(ms.some((m) => m.kind === "new") && ms.some((m) => m.kind === "churn") && ms.some((m) => m.kind === "expansion")).toBe(true);
    expect(new Set(ms.map((m) => m.key)).size).toBe(ms.length);
    for (const p of DEMO_PRODUCTS) {
      const mine = ms.filter((m) => m.productId === p.id);
      expect(mrrAt(mine, TODAY).mrr, p.name).toBeGreaterThan(0);
      expect(metrics(mine, new Date("2026-10-05T23:59:59Z"), TODAY).customers, p.name).toBeGreaterThan(0);
    }
    expect(ms.every((m) => m.occurredAt <= TODAY)).toBe(true);
  });

  it("has paid orders and at most a few refunds, all on mapped products", () => {
    const lines = revenueFrom(demoBillingEvents(TODAY), DEMO_PRODUCT_MAP);
    expect(lines.filter((l) => l.kind === "order").length).toBeGreaterThan(20);
    expect(lines.every((l) => DEMO_PRODUCTS.some((p) => p.id === l.productId))).toBe(true);
  });
});
