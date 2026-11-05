import "server-only";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { budget, category, rule, txn, userPrefs } from "@/lib/db/schema";
import type { Budget, BudgetWrite } from "./budgets";
import { assertMinor } from "./currency";
import { addMonths, endOfMonth, startOfMonth, todayIn, type Day } from "./dates";
import type { Category, Txn } from "./money";
import type { Rule, RuleWrite } from "./rules";
import { loadCategories, present, settingsOf, toBudget, toRule, toTxn } from "./store";

// Budget and rule persistence (T38). Callers pass the owner's id from
// requireOwner() (SPEC V7, V28); every category id in the input is checked to
// be the owner's. Ids come from the client, so a create sent twice lands once.

const NO_ID = "00000000-0000-0000-0000-000000000000";

export type SaveBudgetOutcome = { kind: "saved"; budget: Budget } | { kind: "not-yours" } | { kind: "taken" };

/** True when Postgres refused a write on a unique key. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? e.code : undefined);
  return code(error) === "23505" || (typeof error === "object" && error !== null && "cause" in error && code(error.cause) === "23505");
}

/**
 * Creates or edits one budget. One per category (and one overall) a month:
 * a second for the same category is refused as `taken`, never merged.
 */
export async function saveBudget(userId: string, w: BudgetWrite): Promise<SaveBudgetOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const sameTarget = w.categoryId === null ? sql`${budget.categoryId} is null` : eq(budget.categoryId, w.categoryId);
  const [owned, clash] = await db.batch([
    db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, w.categoryId ?? NO_ID), eq(category.userId, userId)))
      .limit(1),
    db
      .select({ id: budget.id })
      .from(budget)
      .where(and(eq(budget.userId, userId), sameTarget, ne(budget.id, w.id)))
      .limit(1),
  ]);
  if (w.categoryId !== null && owned.length === 0) return { kind: "not-yours" };
  if (clash.length > 0) return { kind: "taken" };
  const values = { categoryId: w.categoryId, amountMinor: assertMinor(w.amountMinor), currency: w.currency, rollover: w.rollover };
  try {
    const rows = await db
      .insert(budget)
      .values({ id: w.id, userId, ...values })
      .onConflictDoUpdate({ target: budget.id, set: { ...values, updatedAt: sql`now()` }, setWhere: eq(budget.userId, userId) })
      .returning();
    const saved = rows[0] ? toBudget(rows[0]) : null;
    return saved ? { kind: "saved", budget: saved } : { kind: "not-yours" };
  } catch (error) {
    // Two devices made a budget for one category at once.
    if (isUniqueViolation(error)) return { kind: "taken" };
    throw error;
  }
}

export async function deleteBudget(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(budget).where(and(eq(budget.id, id), eq(budget.userId, userId)));
  return true;
}

export type SaveRuleOutcome = { kind: "saved"; rule: Rule } | { kind: "not-yours" };

export async function saveRule(userId: string, w: RuleWrite): Promise<SaveRuleOutcome | null> {
  const db = getDb();
  if (!db) return null;
  if (w.categoryId !== null) {
    const owned = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, w.categoryId), eq(category.userId, userId)))
      .limit(1);
    if (owned.length === 0) return { kind: "not-yours" };
  }
  const values = {
    match: { payeeContains: w.payeeContains },
    action: { categoryId: w.categoryId, tags: w.tags },
    priority: w.priority,
    enabled: w.enabled,
  };
  const rows = await db
    .insert(rule)
    .values({ id: w.id, userId, ...values })
    .onConflictDoUpdate({ target: rule.id, set: { ...values, updatedAt: sql`now()` }, setWhere: eq(rule.userId, userId) })
    .returning();
  const saved = rows[0] ? toRule(rows[0]) : null;
  return saved ? { kind: "saved", rule: saved } : { kind: "not-yours" };
}

export async function deleteRule(userId: string, id: string): Promise<true | null> {
  const db = getDb();
  if (!db) return null;
  await db.delete(rule).where(and(eq(rule.id, id), eq(rule.userId, userId)));
  return true;
}

/** The owner's enabled rules, for an import. Empty without a database or on a failed read. */
export async function loadRules(userId: string): Promise<Rule[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = await db.select().from(rule).where(and(eq(rule.userId, userId), eq(rule.enabled, true)));
    return rows.map(toRule).filter(present);
  } catch (error) {
    console.error("loadRules failed", error);
    return [];
  }
}

/** What the budget check needs (V31): the owner's day and zone, budgets, categories and spend since last month. */
export interface BudgetFacts {
  today: Day;
  timeZone: string;
  budgets: Budget[];
  categories: Category[];
  txns: Txn[];
}

export async function loadBudgetFacts(userId: string, now = new Date()): Promise<BudgetFacts | null> {
  const db = getDb();
  if (!db) return null;
  const [prefsRows, budgetRows] = await db.batch([
    db
      .select({ baseCurrency: userPrefs.baseCurrency, timeZone: userPrefs.timeZone })
      .from(userPrefs)
      .where(eq(userPrefs.userId, userId))
      .limit(1),
    db.select().from(budget).where(eq(budget.userId, userId)),
  ]);
  const budgets = budgetRows.map(toBudget).filter(present);
  const { timeZone } = settingsOf(prefsRows[0]);
  const today = todayIn(timeZone, now);
  if (budgets.length === 0) return { today, timeZone, budgets, categories: [], txns: [] };
  // Last month too: rollover carries its leftover.
  const from = addMonths(startOfMonth(today), -1);
  const [categories, txnRows] = await Promise.all([
    loadCategories(userId),
    db
      .select()
      .from(txn)
      .where(and(eq(txn.userId, userId), gte(txn.postedOn, from), lte(txn.postedOn, endOfMonth(today)))),
  ]);
  return { today, timeZone, budgets, categories, txns: txnRows.map(toTxn).filter(present) };
}
