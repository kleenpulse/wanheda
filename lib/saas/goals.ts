import { z } from "zod";
import { roundHalfEven, scale } from "@/lib/money/convert";
import { CURRENCY_CODES, type Currency } from "@/lib/money/currency";
import { daysBetween, isDay, type Day } from "@/lib/money/dates";

// Goals (FR-INCOME-10, T43), pure. "MRR $5k by June" tracks MRR in the goal's
// currency (one product, or every product); "save ₦2m" tracks cash, the open
// accounts' balances converted to the goal's currency (V26). Progress is the
// value now; the projection is a straight line through the last 90 days, out
// to the due date.

export const GOAL_KINDS = ["mrr", "save"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const PROJECTION_DAYS = 90;

export interface Goal {
  id: string;
  kind: GoalKind;
  title: string;
  /** An MRR goal's product; null = every product. Always null for a save goal. */
  productId: string | null;
  targetMinor: number;
  currency: Currency;
  dueOn: Day | null;
  /** Epoch ms. */
  createdAt: number;
}

export const goalWriteSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(GOAL_KINDS),
    title: z.string().trim().max(80),
    productId: z.uuid().nullable(),
    targetMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.enum(CURRENCY_CODES as [Currency, ...Currency[]]),
    dueOn: z.string().refine(isDay, "Not a calendar day").nullable(),
  })
  .strict()
  .refine((g) => g.kind === "mrr" || g.productId === null, { message: "A save goal has no product", path: ["productId"] });
export type GoalWrite = z.infer<typeof goalWriteSchema>;

export const goalIdSchema = z.object({ id: z.uuid() }).strict();

export function goalWriteOf(g: Goal): GoalWrite {
  return { id: g.id, kind: g.kind, title: g.title, productId: g.productId, targetMinor: g.targetMinor, currency: g.currency, dueOn: g.dueOn };
}

export type GoalStatus =
  /** Already there. */
  | "reached"
  /** The line through the last 90 days reaches the target by the due date. */
  | "on-track"
  | "behind"
  /** The due date has passed short of the target. */
  | "missed"
  /** No due date: progress only. */
  | "open";

export interface GoalProgress {
  current: number;
  /** current ÷ target, clamped to [0, 1] for a bar. */
  share: number;
  /** The value on the due date if the last 90 days' pace holds; null without a due date or once it has passed. */
  projected: number | null;
  status: GoalStatus;
  /** How far the projection (or, past due, the value) falls short; null when not behind. */
  shortBy: number | null;
  daysLeft: number | null;
}

/**
 * `current`: the value today. `past`: the value 90 days ago. Integers in the
 * goal's currency; the projection is rounded half-even once (V26).
 */
export function goalProgress(goal: Pick<Goal, "targetMinor" | "dueOn">, current: number, past: number, today: Day): GoalProgress {
  const share = Math.min(1, Math.max(0, current / goal.targetMinor));
  const base = { current, share };
  if (current >= goal.targetMinor) return { ...base, projected: null, status: "reached", shortBy: null, daysLeft: goal.dueOn ? daysBetween(today, goal.dueOn) : null };
  if (!goal.dueOn) return { ...base, projected: null, status: "open", shortBy: null, daysLeft: null };
  const daysLeft = daysBetween(today, goal.dueOn);
  if (daysLeft < 0) return { ...base, projected: null, status: "missed", shortBy: goal.targetMinor - current, daysLeft };
  const projected = current + roundHalfEven(scale(current - past, daysLeft, PROJECTION_DAYS));
  return projected >= goal.targetMinor
    ? { ...base, projected, status: "on-track", shortBy: null, daysLeft }
    : { ...base, projected, status: "behind", shortBy: goal.targetMinor - projected, daysLeft };
}

/** Goals in a stable order: due soonest first, open-ended last, then by when they were set. */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.dueOn !== b.dueOn) {
      if (a.dueOn === null) return 1;
      if (b.dueOn === null) return -1;
      return a.dueOn < b.dueOn ? -1 : 1;
    }
    return a.createdAt - b.createdAt;
  });
}
