"use server";

import { requireOwner } from "@/lib/auth/owner";
import { strictAccountVoices } from "@/lib/speech/account-voices";
import { addAccountVoices as storeAdd, loadAccountVoices, removeAccountVoice as storeRemove } from "@/lib/speech/account-voices-store";

// The read-aloud voices the owner keeps across devices (SPEC V83). The owner
// comes from the session (SPEC V7); ids are untrusted, only catalog ids pass.
// Demo keeps nothing: its voices are this device's only.

export type AccountVoicesResult = { ok: true; voices: string[] } | { ok: false; reason: "demo" | "failed" };
export type VoiceChangeResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

/** The owner's voices. Read after first paint, never in front of it. */
export async function accountVoices(): Promise<AccountVoicesResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  try {
    return { ok: true, voices: await loadAccountVoices(owner.user.id) };
  } catch (error) {
    console.error("accountVoices failed", error);
    return { ok: false, reason: "failed" };
  }
}

/** Adds voices this device now holds. */
export async function addAccountVoices(input: unknown): Promise<VoiceChangeResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const ids = strictAccountVoices(input);
  if (!ids || ids.length === 0) return { ok: false, reason: "invalid" };
  try {
    return (await storeAdd(owner.user.id, ids)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("addAccountVoices failed", error);
    return { ok: false, reason: "failed" };
  }
}

/** Takes out a voice the owner deleted. */
export async function removeAccountVoice(input: unknown): Promise<VoiceChangeResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const ids = strictAccountVoices([input]);
  const id = ids?.[0];
  if (!id) return { ok: false, reason: "invalid" };
  try {
    return (await storeRemove(owner.user.id, id)) ? { ok: true } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("removeAccountVoice failed", error);
    return { ok: false, reason: "failed" };
  }
}
