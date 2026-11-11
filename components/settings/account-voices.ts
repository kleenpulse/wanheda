"use client";

import { create } from "zustand";
import { deviceScope } from "@/lib/device/scope";
import { withVoice } from "@/lib/speech/account-voices";

// The voices the owner keeps across devices (SPEC V83), client side. The voice
// files stay per device (voice-manager.ts); this is only the list, so a device
// that lacks some can offer to fetch them (components/speech/voice-offer.tsx).
//
// - Read once per tab, after first paint; null until then, and in demo or
//   when the read failed (no offer is ever made from a guess).
// - A finished download adds its voice; a delete, once its Undo runs out,
//   takes it out. Both show here at once and are saved in the background; a
//   failed save is left alone (the next device to change that voice saves it).
// - A device's voices from before this list are added once per account.

interface AccountVoicesState {
  /** The account's voices in catalog order; null until read, and in demo or after a failed read. */
  voices: readonly string[] | null;
  load: () => Promise<void>;
}

let loading: Promise<void> | null = null;

/** Loaded on first use: the voice manager imports this module, and its first bundle (and its tests) need no server action. */
const actions = () => import("@/actions/voices");

export const useAccountVoices = create<AccountVoicesState>()((set) => ({
  voices: null,
  load: () => {
    loading ??= actions()
      .then((a) => a.accountVoices())
      .then((r) => {
        set({ voices: r.ok ? r.voices : null });
      })
      .catch(() => undefined);
    return loading;
  },
}));

const change = (id: string, keep: boolean) => {
  const { voices } = useAccountVoices.getState();
  if (voices) useAccountVoices.setState({ voices: withVoice(voices, id, keep) });
};

/** A voice landed on this device: the account keeps it. */
export function voiceAdded(id: string): void {
  change(id, true);
  if (deviceScope()?.userId) void actions().then((a) => a.addAccountVoices([id])).catch(() => undefined);
}

/** A voice was deleted from this device (its Undo ran out): the account lets it go. */
export function voiceRemoved(id: string): void {
  change(id, false);
  if (deviceScope()?.userId) void actions().then((a) => a.removeAccountVoice(id)).catch(() => undefined);
}

const SEEDED_KEY = "wanheda-voices-seeded";

function seededScopes(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SEEDED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Adds the voices this device already held before the account kept a list,
 * once per account on this device. Later, only downloads and deletes change it,
 * so a voice deleted on another device isn't brought back from here.
 */
export function seedFromDevice(here: readonly string[]): void {
  const user = deviceScope()?.userId;
  const { voices } = useAccountVoices.getState();
  if (!user || !voices) return;
  const done = seededScopes();
  if (done.includes(user)) return;
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify([...done, user]));
  } catch {
    return;
  }
  const extra = here.filter((id) => !voices.includes(id));
  if (extra.length === 0) return;
  useAccountVoices.setState({ voices: extra.reduce<readonly string[]>((list, id) => withVoice(list, id, true), voices) });
  void actions().then((a) => a.addAccountVoices(extra)).catch(() => undefined);
}
