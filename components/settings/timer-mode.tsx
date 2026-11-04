"use client";

import { usePrefs } from "@/components/prefs/prefs-provider";
import { Segmented } from "@/components/ui/segmented";
import { TIMER_MODES } from "@/lib/activity/timer";
import { TIMER_MODE_LABELS } from "@/lib/prefs/prefs";

const OPTIONS = TIMER_MODES.map((value) => ({ value, label: TIMER_MODE_LABELS[value] }));

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
