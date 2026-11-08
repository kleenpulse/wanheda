"use client";

import { create } from "zustand";
import { db } from "@/lib/media/local";
import { countPlay, type TrackStat } from "@/lib/media/stats";
import { keepsHistory, libraryIsDemo } from "./music-library";

// The play history on this device (T73, V66): how often each track was
// played and when last, for Media Home. It lives in Dexie beside the music
// index and never reaches the server. Demo and a tab-only folder keep it in
// this tab. The music player's clock calls `record` when a start counts.

type State = {
  stats: ReadonlyMap<string, TrackStat>;
  /** False until this device's history has been read, so Home doesn't flash empty. */
  loaded: boolean;
  load: (demo: boolean) => void;
  record: (path: string, now: number) => void;
};

let ready: Promise<void> | null = null;

function ensure(demo: boolean): Promise<void> {
  ready ??= (async () => {
    // Demo writes nothing to the device, so there's nothing of its own to read either.
    const rows = demo ? [] : ((await (await db())?.trackStats.toArray().catch(() => [])) ?? []);
    useTrackStats.setState({ stats: new Map(rows.map((r) => [r.path, r])), loaded: true });
  })();
  return ready;
}

export const useTrackStats = create<State>((set, get) => ({
  stats: new Map(),
  loaded: false,

  load: (demo) => {
    void ensure(demo);
  },

  record: (path, now) => {
    // Counted after the device's rows are in, so a play never overwrites a count it hasn't read.
    void ensure(libraryIsDemo()).then(async () => {
      let stat = countPlay(get().stats.get(path), path, now);
      if (keepsHistory()) {
        // Read, add one and write in one transaction: another tab counting the same song
        // (or this tab's copy, read at load) never overwrites a newer count.
        const d = await db();
        const stored = d
          ? await d
              .transaction("rw", d.trackStats, async () => {
                const next = countPlay(await d.trackStats.get(path), path, now);
                await d.trackStats.put(next);
                return next;
              })
              .catch(() => null)
          : null;
        if (stored) stat = stored;
      }
      set({ stats: new Map(get().stats).set(path, stat) });
    });
  },
}));
