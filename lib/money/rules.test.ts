import { describe, expect, it } from "vitest";
import { applyRules, firstMatch, nextPriority, orderRules, pastMatches, ruleMatches, ruleWriteSchema, type Rule } from "./rules";

const rule = (over: Partial<Rule>): Rule => ({ id: "r", payeeContains: "uber", categoryId: "transport", tags: [], priority: 0, enabled: true, createdAt: 0, ...over });

describe("matching", () => {
  it("ignores case and runs of spaces", () => {
    expect(ruleMatches(rule({ payeeContains: "Uber  Trip" }), "UBER trip help.uber.com")).toBe(true);
    expect(ruleMatches(rule({}), "Bolt")).toBe(false);
    expect(ruleMatches(rule({ enabled: false }), "uber")).toBe(false);
    expect(ruleMatches(rule({ payeeContains: "   " }), "anything")).toBe(false);
  });

  it("first match by priority, then age, wins", () => {
    const rules = [rule({ id: "late", priority: 1, categoryId: "a" }), rule({ id: "b", priority: 0, createdAt: 5, categoryId: "b" }), rule({ id: "c", priority: 0, createdAt: 1, categoryId: "c" })];
    expect(orderRules(rules).map((r) => r.id)).toEqual(["c", "b", "late"]);
    expect(firstMatch(rules, "uber")?.id).toBe("c");
    expect(firstMatch(rules, "")).toBeNull();
  });
});

describe("applyRules", () => {
  const rules = [rule({ tags: ["work"] }), rule({ id: "s", payeeContains: "shoprite", categoryId: "groceries", tags: ["weekly"], priority: 2 })];

  it("sets the category when there is none and adds tags", () => {
    expect(applyRules({ payee: "Uber", categoryId: null, tags: ["late"] }, rules)).toEqual({ payee: "Uber", categoryId: "transport", tags: ["late", "work"] });
  });

  it("never overrides the owner's pick", () => {
    expect(applyRules({ payee: "Uber", categoryId: "fun", tags: [] }, rules)).toEqual({ payee: "Uber", categoryId: "fun", tags: ["work"] });
  });

  it("drops an unusable category, returns the same object when nothing changes", () => {
    const t = { payee: "Shoprite", categoryId: null, tags: ["weekly"] };
    expect(applyRules(t, rules, (id) => id !== "groceries")).toBe(t);
    const none = { payee: "Bolt", categoryId: null, tags: [] };
    expect(applyRules(none, rules)).toBe(none);
  });
});

describe("helpers", () => {
  it("counts past matches and the next priority", () => {
    expect(pastMatches({ payeeContains: "uber" }, [{ payee: "Uber" }, { payee: "uber eats" }, { payee: "Bolt" }])).toBe(2);
    expect(nextPriority([])).toBe(0);
    expect(nextPriority([rule({ priority: 4 }), rule({ priority: 1 })])).toBe(5);
  });

  it("the write schema needs a category or a tag", () => {
    const ok = { id: crypto.randomUUID(), payeeContains: " Uber ", categoryId: null, tags: ["Work", "work"], priority: 0, enabled: true };
    const parsed = ruleWriteSchema.safeParse(ok);
    expect(parsed.success && parsed.data).toMatchObject({ payeeContains: "Uber", tags: ["work"] });
    expect(ruleWriteSchema.safeParse({ ...ok, tags: [] }).success).toBe(false);
    expect(ruleWriteSchema.safeParse({ ...ok, payeeContains: "  " }).success).toBe(false);
  });
});
