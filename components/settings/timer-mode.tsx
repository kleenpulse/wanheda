"use client";

import { usePrefs } from "@/components/prefs/prefs-provider";
import { Segmented } from "@/components/ui/segmented";
import type { TimerMode } from "@/lib/activity/timer";

const OPTIONS: readonly { value: TimerMode; label: string }[] = [
  { value: "single", label: "One per length" },
  { value: "multiple", label: "Allow repeats" },
];

/** What starting a length that's already running does. Saved with the owner's prefs. */
export function TimerModeSetting() {
  const { prefs, update } = usePrefs();
  return (
    <Segmented
      label="Repeat timers"
      value={prefs.timerMode}
      options={OPTIONS}
      onChange={(timerMode) => {
        update({ timerMode });
      }}
    />
  );
}
