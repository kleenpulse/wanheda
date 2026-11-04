import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MINUTE, addTime, createTimer, isRunning, pause, resume, type Timer } from "./timer";

// The activity bus (FRD 4.3), Phase 1 cut: timers only. Modules publish here
// and the island reads it. Timers are wall-clock timestamps, so persisting
// the store to localStorage makes them survive a reload; the `storage` event
// keeps other tabs in step (ActivitySync). Media, speech and transfer
// activities join when their modules arrive.

export const ACTIVITY_STORAGE_KEY = "wanheda-activity";

interface ActivityState {
  timers: Timer[];
  /** The timer started most recently in this tab; the island brings it forward. */
  lastStarted: string | null;
  /** Starts a timer and returns its id. */
  startTimer: (ms: number, label?: string) => string;
  toggleTimer: (id: string) => void;
  addToTimer: (id: string, ms?: number) => void;
  cancelTimer: (id: string) => void;
}

function update(timers: Timer[], id: string, fn: (t: Timer) => Timer): Timer[] {
  return timers.map((t) => (t.id === id ? fn(t) : t));
}

export const useActivity = create<ActivityState>()(
  persist(
    (set) => ({
      timers: [],
      lastStarted: null,
      startTimer(ms, label) {
        const id = crypto.randomUUID();
        set((s) => ({ timers: [...s.timers, createTimer(id, ms, Date.now(), label)], lastStarted: id }));
        return id;
      },
      toggleTimer(id) {
        const now = Date.now();
        set((s) => ({ timers: update(s.timers, id, (t) => (isRunning(t) ? pause(t, now) : resume(t, now))) }));
      },
      addToTimer(id, ms = 5 * MINUTE) {
        const now = Date.now();
        set((s) => ({ timers: update(s.timers, id, (t) => addTime(t, ms, now)) }));
      },
      cancelTimer(id) {
        set((s) => ({ timers: s.timers.filter((t) => t.id !== id) }));
      },
    }),
    {
      name: ACTIVITY_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ timers: s.timers }),
      // Rehydrated by ActivitySync after mount: the server renders no
      // activities, so the first client render must not either.
      skipHydration: true,
    },
  ),
);
