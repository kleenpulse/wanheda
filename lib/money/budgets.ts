import { z } from "zod";
import { CURRENCY_CODES, type Currency, type Money } from "./currency";
import { addMonths, endOfMonth, startOfMonth, type Day } from "./dates";
import { convertTotal, type Dated, type FxTable } from "./fx";
import { flowOf, type Category, type Txn } from "./money";
import type { NewNotice } from "@/lib/notifications/notifications";

/*
  Budgets (FR-MONEY-7). One per category a month, plus one overall
  (`categoryId` null). A category budget counts its own spend and its
  children's. Spend in other currencies is converted into the budget's at
  each entry's day (V26); what has no rate is left out and shown apart.
  Rollover (opt-in, envelope style): last month's leftover, or overspend,
  carries into this month once; it does not chain further back.
  Alerts at 80 % and 100 % go to the notification centre and the island,
  once a month each (V31).
*/

export interface Budget {
  id: string;
  /** null = the overall budget. */
  categoryId: string | null;
  /** The monthly amount, > 0. */
  amountMinor: number;
  currency: Currency;
  rollover: boolean;
  /** Epoch ms: rollover only carries from a month the budget already existed in. */
  createdAt: number;
}

export const budgetWriteSchema = z
  .object({
    id: z.uuid(),
    categoryId: z.uuid().nullable(),
    amountMinor: z.number().refine((n) => Number.isSafeInteger(n) && n > 0, "Budget must be a positive whole number of minor units"),
    currency: z.enum(CURRENCY_CODES as [Currency, ...Currency[]]),
    rollover: z.boolean(),
  })
  .strict();

export type BudgetWrite = z.infer<typeof budgetWriteSchema>;

export function budgetWriteOf(b: Budget): BudgetWrite {
  return { id: b.id, categoryId: b.categoryId, amountMinor: b.amountMinor, currency: b.currency, rollover: b.rollover };
}

export type AlertLevel = 0 | 80 | 100;

export interface BudgetProgress {
  budget: Budget;
  /** This month's budget: the amount plus any carry. */
  limit: Money;
  /** What rolled over from last month (− for an overspend), or null. */
  carry: Money | null;
  spent: Money;
  /** Spend with no rate on or before its day, per currency: left out of `spent`. */
  missing: Money[];
  level: AlertLevel;
  /** spent ÷ limit, for the bar only (a display ratio, V25). Infinity when the limit is ≤ 0 and money went out. */
  share: number;
}

/** Whether a txn counts against a budget: spend in its category or a child of it (any category for overall). */
function counts(t: Txn, budget: Budget, categories: ReadonlyMap<string, Category>): boolean {
  if (flowOf(t, categories) !== "spend") return false;
  if (budget.categoryId === null) return true;
  if (t.categoryId === budget.categoryId) return true;
  const c = t.categoryId ? categories.get(t.categoryId) : undefined;
  return c?.parentId === budget.categoryId;
}

function spentIn(budget: Budget, txns: readonly Txn[], categories: ReadonlyMap<string, Category>, from: Day, to: Day, table: FxTable) {
  const items: Dated[] = [];
  for (const t of txns) {
    if (t.postedOn < from || t.postedOn > to || !counts(t, budget, categories)) continue;
    // A refund into the category lowers its spend (V25).
    items.push({ minor: -t.amountMinor, currency: t.currency, on: t.postedOn });
  }
  return convertTotal(items, budget.currency, table);
}

/** The level a share of a limit has reached, on the integers (V25). */
export function levelOf(spent: number, limit: number): AlertLevel {
  if (limit <= 0) return spent > 0 ? 100 : 0;
  if (spent >= limit) return 100;
  return spent * 5 >= limit * 4 ? 80 : 0;
}

/**
 * Where a budget stands in the month holding `day`. `startedOn` is the
 * owner's calendar day the budget was made: rollover only carries from a
 * month that started after it existed.
 */
export function budgetProgress(
  budget: Budget,
  txns: readonly Txn[],
  categories: ReadonlyMap<string, Category>,
  day: Day,
  startedOn: Day,
  table: FxTable,
): BudgetProgress {
  const from = startOfMonth(day);
  const to = endOfMonth(day);
  const now = spentIn(budget, txns, categories, from, to, table);
  let carry: Money | null = null;
  const prevFrom = addMonths(from, -1);
  if (budget.rollover && startedOn <= prevFrom) {
    const prev = spentIn(budget, txns, categories, prevFrom, endOfMonth(prevFrom), table);
    carry = { minor: budget.amountMinor - prev.total.minor, currency: budget.currency };
  }
  const limit = { minor: budget.amountMinor + (carry?.minor ?? 0), currency: budget.currency };
  const spent = now.total;
  const share = limit.minor > 0 ? Math.max(0, spent.minor) / limit.minor : spent.minor > 0 ? Infinity : 0;
  return { budget, limit, carry, spent, missing: now.missing, level: levelOf(spent.minor, limit.minor), share };
}

/** Overall first, then by category name. */
export function sortBudgets(list: readonly Budget[], categories: ReadonlyMap<string, Category>): Budget[] {
  const name = (b: Budget) => (b.categoryId ? (categories.get(b.categoryId)?.name ?? "") : "");
  return [...list].sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : name(a).localeCompare(name(b))));
}

export const BUDGETS_HREF = "/money/budgets";

/** `budget:<id|all>:<YYYY-MM>:80|100` (V31): once a month per level, on every device. */
export function budgetAlertKey(budget: Pick<Budget, "id" | "categoryId">, day: Day, level: 80 | 100): string {
  return `budget:${budget.categoryId === null ? "all" : budget.id}:${day.slice(0, 7)}:${String(level)}`;
}

export function parseBudgetAlertKey(key: string): { target: string; month: string; level: 80 | 100 } | null {
  const m = /^budget:([^:]+):(\d{4}-\d{2}):(80|100)$/.exec(key);
  if (!m?.[1] || !m[2]) return null;
  return { target: m[1], month: m[2], level: m[3] === "100" ? 100 : 80 };
}

/** What a budget is called in an alert. */
export function budgetName(budget: Pick<Budget, "categoryId">, categories: ReadonlyMap<string, Category>): string {
  if (budget.categoryId === null) return "Overall";
  return categories.get(budget.categoryId)?.name ?? "A category";
}

/**
 * The alerts a month's progress raises: only the highest level reached, so
 * spending past 100 % at once says so once, not twice. Text has no amounts
 * (figures only show through <MoneyText>, V25).
 */
export function budgetAlerts(progress: readonly BudgetProgress[], categories: ReadonlyMap<string, Category>, day: Day): NewNotice[] {
  const out: NewNotice[] = [];
  for (const p of progress) {
    if (p.level === 0) continue;
    const name = budgetName(p.budget, categories);
    const over = p.level === 100;
    const what = p.budget.categoryId === null ? "this month's overall budget" : `this month's ${name} budget`;
    out.push({
      kind: "money",
      title: over ? `${name} budget used up` : `${name} budget at 80 %`,
      body: over ? `Spending has reached ${what}.` : `Spending has reached 80 % of ${what}.`,
      href: BUDGETS_HREF,
      dedupeKey: budgetAlertKey(p.budget, day, p.level),
    });
  }
  return out;
}

/** Replaces or adds a budget in a list. */
export function upsertBudgetIn(list: readonly Budget[], b: Budget): Budget[] {
  const i = list.findIndex((x) => x.id === b.id);
  return i < 0 ? [...list, b] : list.map((x) => (x.id === b.id ? b : x));
}
