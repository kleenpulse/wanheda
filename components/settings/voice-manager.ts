"use client";

import { create } from "zustand";
import { dismissToast, toast } from "@/components/ui/toaster";
import { piper } from "@/lib/speech/piper";
import { nativePiper } from "@/lib/speech/piper-native";
import { voicePref } from "@/lib/speech/prefs";
import { CATALOG, catalogVoice, DEFAULT_VOICE, hasPartial, installedVoices, installVoice, isInstalled, removeVoice, voiceSize } from "@/lib/speech/voices";

// The voice manager (SPEC V46, T55): which catalog voices are on this device,
// and the downloads and deletes that change that. One per tab; Settings →
// Voices shows it and the island's `transfer` activity follows its downloads,
// so a download keeps going (and stays visible) after leaving Settings.
//
// - Downloads run one at a time (each holds its voice in memory to check it).
// - A download or delete holds the Web Lock `wanheda-voice:<id>`, so two tabs
//   never write the same voice; a tab that finds it held says so.
// - A delete waits on its Undo toast and only happens when the toast runs out.
// - Other tabs hear of every change on the `wanheda-voices` channel and rescan.

export type DownloadPhase = "queued" | "downloading" | "failed";

export interface VoiceDownload {
  id: string;
  phase: DownloadPhase;
  received: number;
  total: number;
  error: string | null;
}

interface VoiceManagerState {
  /** Catalog voices on this device, in catalog order; null until the first scan. */
  installed: readonly string[] | null;
  downloads: Readonly<Record<string, VoiceDownload>>;
  /** Deletes waiting on their Undo toast: the voice is shown as gone but is still on the device. */
  deleting: readonly string[];
  refresh: () => Promise<void>;
  download: (id: string) => void;
  /** Stops a queued or running download (its partial files are removed), or clears a failed one. */
  cancel: (id: string) => void;
  /** Deletes a voice once its Undo toast runs out. */
  remove: (id: string) => void;
  /** Takes back a delete still waiting on its toast. */
  keep: (id: string) => void;
}

/** Progress reaches the store at most this often. */
const PROGRESS_MS = 150;
const CHANNEL = "wanheda-voices";
const deleteToastId = (id: string) => `voice-delete:${id}`;
const BUSY = Symbol("busy");

export function formatBytes(n: number): string {
  return `${(n / 1_000_000).toFixed(1)} MB`;
}

const nameOf = (id: string) => catalogVoice(id)?.name ?? id;

/** Runs `fn` holding the voice's lock. `wait: false` gives BUSY at once when another tab holds it. */
async function withVoiceLock<T>(id: string, wait: boolean, fn: () => Promise<T>): Promise<T | typeof BUSY> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return fn();
  return navigator.locks.request(`wanheda-voice:${id}`, { ifAvailable: !wait }, (lock) => (lock ? fn() : BUSY));
}

function failure(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "Not enough space on this device.";
  if (error instanceof TypeError) return "Couldn't reach Hugging Face. Check the connection and try again.";
  return error instanceof Error ? error.message : String(error);
}

const inCatalogOrder = (ids: Iterable<string>) => {
  const set = new Set(ids);
  return CATALOG.filter((v) => set.has(v.id)).map((v) => v.id);
};

let channel: BroadcastChannel | null = null;
const announce = () => {
  channel?.postMessage("changed");
};

const controllers = new Map<string, AbortController>();
/** Downloads run one after another. */
let chain: Promise<void> = Promise.resolve();

export const useVoiceManager = create<VoiceManagerState>()((set, get) => {
  const patch = (id: string, next: Partial<VoiceDownload>) => {
    set((s) => {
      const d = s.downloads[id];
      return d ? { downloads: { ...s.downloads, [id]: { ...d, ...next } } } : {};
    });
  };
  const drop = (id: string) => {
    set((s) => {
      if (!(id in s.downloads)) return {};
      const { [id]: _gone, ...rest } = s.downloads;
      return { downloads: rest };
    });
  };
  const setInstalled = (fn: (ids: readonly string[]) => Iterable<string>) => {
    set((s) => ({ installed: inCatalogOrder(fn(s.installed ?? [])) }));
  };

  const run = async (id: string, ctrl: AbortController) => {
    const { signal } = ctrl;
    if (signal.aborted) return;
    const current = () => controllers.get(id) === ctrl;
    try {
      const result = await withVoiceLock(id, false, async () => {
        patch(id, { phase: "downloading" });
        let last = 0;
        await installVoice(id, signal, ({ received, total }) => {
          const now = performance.now();
          if (now - last < PROGRESS_MS && received < total) return;
          last = now;
          if (current()) patch(id, { received });
        });
      });
      if (!current()) return;
      controllers.delete(id);
      if (result === BUSY) {
        patch(id, { phase: "failed", error: "Another tab is downloading this voice." });
        return;
      }
      drop(id);
      const before = get().installed ?? [];
      setInstalled((ids) => [...ids, id]);
      // The first voice on the device becomes the one speech uses.
      if (!before.includes(voicePref.get())) voicePref.set(id);
      announce();
      toast({ title: `${nameOf(id)} is on this device`, body: "Speech uses it offline from now on." });
    } catch (error) {
      if (!current()) return;
      controllers.delete(id);
      if (ctrl.signal.aborted) drop(id);
      else patch(id, { phase: "failed", error: failure(error) });
    }
  };

  const commitRemove = async (id: string) => {
    try {
      await withVoiceLock(id, true, async () => {
        piper.drop(id);
        nativePiper.drop(id);
        await removeVoice(id);
        // removeVoice is quiet about each entry: check the browser really let go.
        if ((await isInstalled(id)) || (await hasPartial(id))) throw new Error("still on the device");
      });
      set((s) => ({ deleting: s.deleting.filter((d) => d !== id) }));
      setInstalled((ids) => ids.filter((d) => d !== id));
      if (voicePref.get() === id) {
        const { installed, deleting } = get();
        voicePref.set(installed?.find((d) => !deleting.includes(d)) ?? DEFAULT_VOICE);
      }
      announce();
    } catch {
      set((s) => ({ deleting: s.deleting.filter((d) => d !== id) }));
      toast({ title: `${nameOf(id)} not deleted`, body: "This browser didn't let go of its files. Try again." });
      void get().refresh();
    }
  };

  return {
    installed: null,
    downloads: {},
    deleting: [],

    refresh: async () => {
      if (!channel && typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = () => void get().refresh();
      }
      const ids = await installedVoices().catch(() => [] as string[]);
      set({ installed: inCatalogOrder(ids) });
      // A download cut short (a closed tab) leaves a partial folder: clear it unless a tab is still on it.
      for (const v of CATALOG) {
        if (ids.includes(v.id) || v.id in get().downloads) continue;
        void hasPartial(v.id)
          .then((partial) =>
            partial
              ? withVoiceLock(v.id, false, async () => {
                  // Checked again under the lock: another tab may have finished this voice in between.
                  if (await hasPartial(v.id)) await removeVoice(v.id);
                })
              : undefined,
          )
          .catch(() => undefined);
      }
    },

    download: (id) => {
      const voice = catalogVoice(id);
      const known = get().downloads[id];
      if (!voice || (known && known.phase !== "failed") || get().installed?.includes(id)) return;
      const ctrl = new AbortController();
      controllers.set(id, ctrl);
      set((s) => ({ downloads: { ...s.downloads, [id]: { id, phase: "queued", received: 0, total: voiceSize(voice), error: null } } }));
      // Voices are large and slow to fetch again: ask the browser not to evict them.
      void navigator.storage?.persist?.().catch(() => false);
      chain = chain.then(() => run(id, ctrl));
    },

    cancel: (id) => {
      controllers.get(id)?.abort();
      controllers.delete(id);
      drop(id);
    },

    remove: (id) => {
      const voice = catalogVoice(id);
      if (!voice || get().deleting.includes(id)) return;
      set((s) => ({ deleting: [...s.deleting, id] }));
      const restore = () => {
        set((s) => ({ deleting: s.deleting.filter((d) => d !== id) }));
      };
      toast({
        id: deleteToastId(id),
        title: `${voice.name} deleted`,
        body: `${formatBytes(voiceSize(voice))} freed when this goes.`,
        action: { label: "Undo", onClick: restore },
        closeLabel: "Cancel delete",
        onClose: restore,
        onExpire: () => void commitRemove(id),
      });
    },

    keep: (id) => {
      // Closing the toast runs its onClose, which takes the delete back.
      dismissToast(deleteToastId(id), "close");
    },
  };
});

/** Leaving the page drops a running download: ask first. */
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    const running = Object.values(useVoiceManager.getState().downloads).some((d) => d.phase !== "failed");
    if (running) e.preventDefault();
  });
}
