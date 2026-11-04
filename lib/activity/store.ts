import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  MINUTE,
  addTime,
  createTimer,
  isDone,
  isRunning,
  labelFor,
  pause,
  restart,
  resume,
  sameLength,
  type Timer,
  TIMER_MODES,
  type TimerMode,
} from "./timer";

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
  /** When it was started, so starting the same timer again still brings it forward. */
  lastStartedAt: number;
  /** One timer per length (default) or repeats allowed. Kept with the timers, on this device. */
  timerMode: TimerMode;
  setTimerMode: (mode: TimerMode) => void;
  /**
   * Starts a timer and returns its id. In `single` mode a length already on
   * the bus is brought forward instead (and started over if it has finished).
   */
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
    (set, get) => ({
      timers: [],
      lastStarted: null,
      lastStartedAt: 0,
      timerMode: "single",
      setTimerMode(mode) {
        set({ timerMode: mode });
      },
      startTimer(ms, label) {
        const now = Date.now();
        const { timers, timerMode } = get();
        const same = timerMode === "single" ? sameLength(timers, ms) : undefined;
        if (same) {
          set({
            timers: isDone(same, now) ? update(timers, same.id, (t) => restart(t, now)) : timers,
            lastStarted: same.id,
            lastStartedAt: now,
          });
          return same.id;
        }
        const id = crypto.randomUUID();
        const timer = createTimer(id, ms, now, label ?? labelFor(timers, ms));
        set({ timers: [...timers, timer], lastStarted: id, lastStartedAt: now });
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
      partialize: (s) => ({ timers: s.timers, timerMode: s.timerMode }),
      // A stored mode that isn't one we know falls back to the default.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ActivityState>;
        const mode = TIMER_MODES.includes(p.timerMode as TimerMode) ? (p.timerMode as TimerMode) : current.timerMode;
        return { ...current, timers: Array.isArray(p.timers) ? p.timers : current.timers, timerMode: mode };
      },
      // Rehydrated by ActivitySync after mount: the server renders no
      // activities, so the first client render must not either.
      skipHydration: true,
    },
  ),
);
