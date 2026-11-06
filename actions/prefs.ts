"use server";

import { z } from "zod";
import { TIMER_MODES } from "@/lib/activity/timer";
import { requireOwner } from "@/lib/auth/owner";
import { SKINS, WALLPAPERS } from "@/lib/prefs/prefs";
import { savePrefs as storePrefs, saveReaderPrefs as storeReaderPrefs } from "@/lib/prefs/store";
import { completeReaderPrefs } from "@/lib/reader/prefs";

export type SavePrefsResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

const prefsSchema = z
  .object({
    skin: z.enum(SKINS),
    accent: z
      .string()
      .regex(/^#[0-9a-f]{6}$/)
      .nullable(),
    wallpaper: z.enum(WALLPAPERS),
    timerMode: z.enum(TIMER_MODES),
  })
  .strict();

/**
 * Saves the owner's prefs (FR-SHELL-7). The owner comes from the session
 * (SPEC V7); the prefs are untrusted input, checked field by field. Demo
 * prefs live only in the device's cookie.
 */
export async function savePrefs(input: unknown): Promise<SavePrefsResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };

  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  try {
    return (await storePrefs(owner.user.id, parsed.data)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("savePrefs failed", error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Saves the owner's reader prefs (Settings → Reader): the whole set, every
 * field checked by lib/reader/prefs.ts, unknown keys refused. Demo keeps
 * them on the device only.
 */
export async function saveReaderPrefs(input: unknown): Promise<SavePrefsResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };

  const reader = completeReaderPrefs(input);
  if (!reader) return { ok: false, reason: "invalid" };

  try {
    return (await storeReaderPrefs(owner.user.id, reader)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("saveReaderPrefs failed", error);
    return { ok: false, reason: "failed" };
  }
}
