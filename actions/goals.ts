"use server";

import { requireOwner } from "@/lib/auth/owner";
import { goalIdSchema, goalWriteSchema, type Goal } from "@/lib/saas/goals";
import { deleteGoal as deleteStoredGoal, saveGoal as saveStoredGoal } from "@/lib/saas/store";

// Goals (FR-INCOME-10, T43). requireOwner() first and the owner from the
// session (SPEC V7); the id is the client's, so a replay is a no-op (V28).
// Demo never saves: its goals live in the tab.

export type GoalFail = { ok: false; reason: "demo" | "invalid" | "off" | "failed" };
export type GoalReply = { ok: true; goal: Goal } | GoalFail;

export async function saveGoal(input: unknown): Promise<GoalReply> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = goalWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const saved = await saveStoredGoal(owner.user.id, parsed.data);
    if (saved === null) return { ok: false, reason: "off" };
    return saved === "not-yours" ? { ok: false, reason: "invalid" } : { ok: true, goal: saved };
  } catch (error) {
    console.error("saveGoal failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function deleteGoal(input: unknown): Promise<{ ok: true } | GoalFail> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = goalIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredGoal(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "off" };
  } catch (error) {
    console.error("deleteGoal failed", error);
    return { ok: false, reason: "failed" };
  }
}
