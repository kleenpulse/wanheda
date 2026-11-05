"use client";

import * as React from "react";
import { LiveActivity } from "@/components/island/live-activity";
import { moneyAlertActivity, useMoneyAlerts } from "@/components/island/money-alert-activity";
import { orderTimers, timerActivity } from "@/components/island/timer-activity";
import { ACTIVITY_STORAGE_KEY, useActivity } from "@/lib/activity/store";

/**
 * Loads the activity bus from localStorage after mount (the server renders no
 * activities) and follows other tabs through the `storage` event.
 */
function useActivitySync() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    void Promise.resolve(useActivity.persist.rehydrate()).then(() => {
      setReady(true);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_STORAGE_KEY) void useActivity.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return ready;
}

/**
 * The island at the top centre of the content column (FR-ISLAND-1). It lives
 * in the shell frame, so it survives navigation between apps. Order is
 * decided when the set of timers changes, not on every tick, so the pill
 * doesn't jump between timers as their clocks run.
 */
export function Island() {
  const ready = useActivitySync();
  const timers = useActivity((s) => s.timers);
  const lastStarted = useActivity((s) => s.lastStarted);
  const lastStartedAt = useActivity((s) => s.lastStartedAt);
  const { alerts, today } = useMoneyAlerts();
  const activities = React.useMemo(
    () => [...orderTimers(timers).map(timerActivity), ...alerts.map((a) => moneyAlertActivity(a, today))],
    [timers, alerts, today],
  );

  if (!ready || activities.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-40 md:left-(--rail-w)">
      <LiveActivity activities={activities} show={lastStarted ?? undefined} showKey={lastStartedAt} />
    </div>
  );
}
