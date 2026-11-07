"use client";

import { create } from "zustand";

// The remux's island beat (V53, T61): shown only when starting playback takes
// longer than about a second, so a fast remux never flashes a card. One at a
// time: the player plays one file.

export const SLOW_REMUX_MS = 1000;

export type RemuxJob = { id: string; title: string; cancel: () => void };

export const useRemuxStatus = create<{
  job: RemuxJob | null;
  show: (job: RemuxJob) => void;
  clear: (id: string) => void;
}>((set, get) => ({
  job: null,
  show: (job) => {
    set({ job });
  },
  clear: (id) => {
    if (get().job?.id === id) set({ job: null });
  },
}));

/**
 * Shows `job` on the island only if it is still starting after
 * SLOW_REMUX_MS. Returns `end`, which cancels the timer and clears the card:
 * call it on first frame, on failure and on unmount, so a remux that fails
 * fast never leaves a card behind.
 */
export function slowRemuxNotice(job: RemuxJob, ms = SLOW_REMUX_MS): () => void {
  let ended = false;
  const timer = setTimeout(() => {
    if (!ended) useRemuxStatus.getState().show(job);
  }, ms);
  return () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    useRemuxStatus.getState().clear(job.id);
  };
}
