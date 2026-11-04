"use server";

import { requireOwner } from "@/lib/auth/owner";
import { BREAKPOINT_NAMES, layoutsInputSchema, sanitizeLayout, type BoardItem, type Breakpoint } from "@/lib/board/layout";
import { saveLayouts } from "@/lib/board/store";

export type SaveBoardResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

/**
 * Saves the board's layout for the breakpoints given (FR-SHELL-2). The owner
 * comes from the session (SPEC V7); the layouts are untrusted input, cleaned
 * by the same rules the board renders with. Demo boards are never saved.
 */
export async function saveBoard(input: unknown): Promise<SaveBoardResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };

  const parsed = layoutsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const clean: Partial<Record<Breakpoint, BoardItem[]>> = {};
  for (const bp of BREAKPOINT_NAMES) {
    const raw = parsed.data[bp];
    if (raw) clean[bp] = sanitizeLayout(raw, bp);
  }

  try {
    return (await saveLayouts(owner.user.id, clean)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("saveBoard failed", error);
    return { ok: false, reason: "failed" };
  }
}
