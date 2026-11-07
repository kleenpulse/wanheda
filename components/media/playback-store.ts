"use client";

import { create } from "zustand";
import { db, type ProgressRow } from "@/lib/media/local";
import type { PlaybackReply, PlaybackWrite } from "@/lib/media/media";
import type { LocalProgress } from "@/lib/media/playback";

// This device's copy of where each item was left (V55, V24 cache-first).
// Every write lands here and in IndexedDB first; the server gets it on a
// slower clock, or by beacon when the page hides. A write the server hasn't
// confirmed stays pending and is sent again on the next load. Demo keeps it
// in this tab only and never sends.

const ENDPOINT = "/api/media/progress";

type State = {
  byItem: Readonly<Record<string, LocalProgress>>;
  loaded: boolean;
  load: (demo: boolean) => void;
  record: (itemId: string, p: { positionS: number; watched: boolean }, send: "none" | "fetch" | "beacon", demo: boolean) => void;
};

async function markSent(itemId: string, at: number): Promise<void> {
  const d = await db();
  await d?.progress
    .where("itemId")
    .equals(itemId)
    .modify((row: ProgressRow) => {
      if (row.at === at) row.pending = 0;
    })
    .catch(() => undefined);
}

async function send(w: PlaybackWrite, how: "fetch" | "beacon"): Promise<void> {
  const body = JSON.stringify(w);
  if (how === "beacon") {
    // Stays pending: the next load resends it, and the server keeps the newer.
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
    return;
  }
  try {
    const res = await fetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "text/plain" }, keepalive: true });
    const reply = (await res.json().catch(() => null)) as PlaybackReply | null;
    // Saved, stale (the server holds newer) or gone (deleted elsewhere): nothing more to send.
    if (reply && (reply.ok || reply.reason === "gone")) await markSent(w.itemId, w.at);
  } catch {
    // Offline: stays pending.
  }
}

export const usePlayback = create<State>((set, get) => ({
  byItem: {},
  loaded: false,
  load: (demo) => {
    if (get().loaded) return;
    set({ loaded: true });
    if (demo) return;
    void (async () => {
      const d = await db();
      const rows = (await d?.progress.toArray().catch(() => [])) ?? [];
      if (rows.length === 0) return;
      const byItem: Record<string, LocalProgress> = { ...get().byItem };
      for (const r of rows) {
        const mine = byItem[r.itemId];
        if (!mine || mine.at < r.at) byItem[r.itemId] = { positionS: r.positionS, watched: r.watched, at: r.at };
      }
      set({ byItem });
      for (const r of rows) if (r.pending === 1) void send({ itemId: r.itemId, positionS: r.positionS, watched: r.watched, at: r.at }, "fetch");
    })();
  },
  record: (itemId, p, how, demo) => {
    const at = Date.now();
    const entry: LocalProgress = { positionS: Math.max(0, p.positionS), watched: p.watched, at };
    set((s) => ({ byItem: { ...s.byItem, [itemId]: entry } }));
    if (demo) return;
    void db().then((d) => d?.progress.put({ itemId, ...entry, pending: 1 }).catch(() => undefined));
    if (how !== "none") void send({ itemId, ...entry }, how);
  },
}));
