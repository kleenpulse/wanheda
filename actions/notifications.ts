"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import { timerDoneNotice, type Notice } from "@/lib/notifications/notifications";
import { addNotice, deleteNotices, markNoticesRead } from "@/lib/notifications/store";

export type NotifyResult = { ok: true; notice: Notice } | { ok: false; reason: "demo" | "invalid" | "failed" };
export type MarkReadResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };
export type DeleteNoticesResult = MarkReadResult;

const timerSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().max(200),
    endsAt: z.number().int().positive(),
    totalMs: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Records that a timer finished (FR-SHELL-6). The browser raises it, so the
 * text is built here from checked fields, a timer that hasn't ended yet is
 * refused, and the dedupe key keeps two tabs from recording it twice.
 */
export async function notifyTimerDone(input: unknown): Promise<NotifyResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = timerSchema.safeParse(input);
  if (!parsed.success || parsed.data.endsAt > Date.now() + 5_000) return { ok: false, reason: "invalid" };
  try {
    const notice = await addNotice(owner.user.id, timerDoneNotice(parsed.data));
    return notice ? { ok: true, notice } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("notifyTimerDone failed", error);
    return { ok: false, reason: "failed" };
  }
}

const markSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

/** Marks some notices, or all of them, read. Only the owner's own rows are touched. */
export async function markNotificationsRead(input: unknown): Promise<MarkReadResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const ids = "all" in parsed.data ? "all" : parsed.data.ids;
    return (await markNoticesRead(owner.user.id, ids)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("markNotificationsRead failed", error);
    return { ok: false, reason: "failed" };
  }
}

const deleteSchema = z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict();

/** Deletes some notices. Only the owner's own rows are touched; a deleted alert is never raised again. */
export async function deleteNotifications(input: unknown): Promise<DeleteNoticesResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return (await deleteNotices(owner.user.id, parsed.data.ids)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("deleteNotifications failed", error);
    return { ok: false, reason: "failed" };
  }
}
