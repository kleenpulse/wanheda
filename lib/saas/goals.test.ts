import { describe, expect, it } from "vitest";
import { goalProgress, goalWriteSchema, sortGoals, type Goal } from "./goals";

const TODAY = "2026-11-05";
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "00000000-0000-4000-8000-000000000001",
  kind: "mrr",
  title: "MRR $1k",
  productId: null,
  targetMinor: 100_000,
  currency: "USD",
  dueOn: "2027-02-03", // 90 days after TODAY
  createdAt: 0,
  ...over,
});

describe("goalProgress", () => {
  it("projects the last 90 days' line to the due date: on track", () => {
    // +30 000 over the last 90 days, 90 days left ⇒ 70 000 + 30 000 = 100 000: exactly on target.
    const p = goalProgress(goal(), 70_000, 40_000, TODAY);
    expect(p).toMatchObject({ status: "on-track", projected: 100_000, shortBy: null, daysLeft: 90 });
    expect(p.share).toBeCloseTo(0.7);
  });

  it("says how far behind the line ends", () => {
    expect(goalProgress(goal(), 60_000, 45_000, TODAY)).toMatchObject({ status: "behind", projected: 75_000, shortBy: 25_000 });
  });

  it("a falling line projects down, never past what it is", () => {
    expect(goalProgress(goal(), 60_000, 70_000, TODAY)).toMatchObject({ status: "behind", projected: 50_000, shortBy: 50_000 });
  });

  it("rounds the projection half-even once", () => {
    // +1 over 90 days, 45 days left ⇒ +0.5 ⇒ rounds to even (0).
    expect(goalProgress(goal({ dueOn: "2026-12-20" }), 50_000, 49_999, TODAY).projected).toBe(50_000);
  });

  it("reached, missed and open goals", () => {
    expect(goalProgress(goal(), 100_000, 0, TODAY)).toMatchObject({ status: "reached", share: 1, projected: null });
    expect(goalProgress(goal({ dueOn: "2026-11-01" }), 80_000, 0, TODAY)).toMatchObject({ status: "missed", shortBy: 20_000, daysLeft: -4 });
    expect(goalProgress(goal({ dueOn: null }), 80_000, 0, TODAY)).toMatchObject({ status: "open", projected: null, daysLeft: null });
    expect(goalProgress(goal(), -5, 0, TODAY).share).toBe(0);
  });
});

describe("goalWriteSchema", () => {
  const ok = { id: "00000000-0000-4000-8000-000000000001", kind: "mrr", title: "x", productId: null, targetMinor: 1, currency: "USD", dueOn: "2027-01-01" };
  it("takes a well-formed goal", () => {
    expect(goalWriteSchema.safeParse(ok).success).toBe(true);
  });
  it("refuses a save goal with a product, a bad day, an unknown currency, a float, extra keys", () => {
    expect(goalWriteSchema.safeParse({ ...ok, kind: "save", productId: "00000000-0000-4000-8000-000000000002" }).success).toBe(false);
    expect(goalWriteSchema.safeParse({ ...ok, dueOn: "2027-02-30" }).success).toBe(false);
    expect(goalWriteSchema.safeParse({ ...ok, currency: "XTS" }).success).toBe(false);
    expect(goalWriteSchema.safeParse({ ...ok, targetMinor: 1.5 }).success).toBe(false);
    expect(goalWriteSchema.safeParse({ ...ok, userId: "x" }).success).toBe(false);
  });
});

describe("sortGoals", () => {
  it("due soonest first, open-ended last, then oldest", () => {
    const a = goal({ id: "a", dueOn: "2027-05-01" });
    const b = goal({ id: "b", dueOn: null, createdAt: 1 });
    const c = goal({ id: "c", dueOn: "2026-12-01" });
    const d = goal({ id: "d", dueOn: null, createdAt: 0 });
    expect(sortGoals([a, b, c, d]).map((g) => g.id)).toEqual(["c", "a", "d", "b"]);
  });
});
