"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { budgetAlertsForSave } from "@/lib/money/alerts";
import { budgetWriteSchema } from "@/lib/money/budgets";
import { CURRENCY_CODES, type Currency } from "@/lib/money/currency";
import type { BudgetSaveResult, PlanDeleteResult, RuleSaveResult } from "@/lib/money/outbox";
import { deleteBudget as deleteStoredBudget, deleteRule as deleteStoredRule, saveBudget as saveStoredBudget, saveRule as saveStoredRule } from "@/lib/money/plans-store";
import { ruleWriteSchema } from "@/lib/money/rules";
import { saveBaseCurrency as storeBaseCurrency } from "@/lib/prefs/store";

// Budget and rule writes (FR-MONEY-7, 13) and the base currency (FR-MONEY-14).
// The owner comes from the session and every id in the input is checked
// against it in the store (SPEC V7, V28); demo writes stay on the device.

const idSchema = z.object({ id: z.uuid() }).strict();

/** Creates or edits a budget. The alerts it makes due (V31) are raised now and returned. */
export async function saveBudget(input: unknown): Promise<BudgetSaveResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = budgetWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await saveStoredBudget(owner.user.id, parsed.data);
    if (!outcome) return { ok: false, reason: "failed" };
    if (outcome.kind === "not-yours") return { ok: false, reason: "invalid" };
    if (outcome.kind === "taken") return { ok: false, reason: "taken" };
    return { ok: true, budget: outcome.budget, notices: await budgetAlertsForSave(owner.user.id, after) };
  } catch (error) {
    console.error("saveBudget failed", error);
    return { ok: false, reason: "failed" };
  }
}

/** Deletes a budget. Already gone counts as done, so a retry settles. */
export async function deleteBudget(input: unknown): Promise<PlanDeleteResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredBudget(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("deleteBudget failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function saveRule(input: unknown): Promise<RuleSaveResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = ruleWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const outcome = await saveStoredRule(owner.user.id, parsed.data);
    if (!outcome) return { ok: false, reason: "failed" };
    return outcome.kind === "saved" ? { ok: true, rule: outcome.rule } : { ok: false, reason: "invalid" };
  } catch (error) {
    console.error("saveRule failed", error);
    return { ok: false, reason: "failed" };
  }
}

export async function deleteRule(input: unknown): Promise<PlanDeleteResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteStoredRule(owner.user.id, parsed.data.id)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("deleteRule failed", error);
    return { ok: false, reason: "failed" };
  }
}

export type BaseCurrencyResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

const baseSchema = z.object({ currency: z.enum(CURRENCY_CODES as [Currency, ...Currency[]]) }).strict();

/** Sets the currency reports convert into. Amounts themselves never change (V26: derived at read). */
export async function saveBaseCurrency(input: unknown): Promise<BaseCurrencyResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await storeBaseCurrency(owner.user.id, parsed.data.currency)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("saveBaseCurrency failed", error);
    return { ok: false, reason: "failed" };
  }
}
