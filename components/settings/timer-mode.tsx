"use client";

import * as React from "react";
import { motion } from "motion/react";
import { useActivity } from "@/lib/activity/store";
import type { TimerMode } from "@/lib/activity/timer";
import { TAB_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: TimerMode; label: string }[] = [
  { mode: "single", label: "One per length" },
  { mode: "multiple", label: "Allow repeats" },
];

/** True once the activity store has loaded this device's saved state. */
function useActivityHydrated(): boolean {
  return React.useSyncExternalStore(
    (onChange) => useActivity.persist.onFinishHydration(onChange),
    () => useActivity.persist.hasHydrated(),
    () => false,
  );
}

/**
 * What starting a length that's already running does. Saved with the timers
 * on this device; moves to the owner's prefs with T27.
 */
export function TimerModeSetting() {
  const hydrated = useActivityHydrated();
  const mode = useActivity((s) => s.timerMode);
  const setMode = useActivity((s) => s.setTimerMode);
  const indicatorId = React.useId();

  return (
    <div
      role="group"
      aria-label="Repeat timers"
      className={cn(
        "flex items-center rounded-pill bg-sheet p-1 ring-1 ring-border transition-opacity dark:bg-background/40 dark:ring-glass-border",
        !hydrated && "opacity-0",
      )}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.mode;
        return (
          <button
            key={o.mode}
            type="button"
            aria-pressed={active}
            disabled={!hydrated}
            onClick={() => {
              setMode(o.mode);
            }}
            className={cn(
              "relative isolate inline-flex h-8 items-center rounded-pill px-3.5 text-[12px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-inverse-foreground dark:text-signal" : "text-ink-2 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={indicatorId}
                layoutDependency={mode}
                transition={TAB_SPRING}
                aria-hidden
                style={{ borderRadius: 9999 }}
                className="absolute inset-0 -z-10 bg-inverse dark:bg-signal-soft"
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
