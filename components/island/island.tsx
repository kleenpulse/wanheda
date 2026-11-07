"use client";

import * as React from "react";
import { LiveActivity } from "@/components/island/live-activity";
import { remuxActivity } from "@/components/island/remux-activity";
import { scanActivity } from "@/components/island/scan-activity";
import { moneyAlertActivity, useMoneyAlerts } from "@/components/island/money-alert-activity";
import { saasAlertActivity, useSaasAlerts } from "@/components/island/saas-alert-activity";
import { SPEECH_ACTIVITY, speechActivity } from "@/components/island/speech-activity";
import { orderTimers, timerActivity } from "@/components/island/timer-activity";
import { transferActivity } from "@/components/island/transfer-activity";
import { useMusicLibrary } from "@/components/media/music-library";
import { useRemuxStatus } from "@/components/media/remux-status";
import { useVoiceManager } from "@/components/settings/voice-manager";
import { ACTIVITY_STORAGE_KEY, useActivity } from "@/lib/activity/store";
import { useSpeech } from "@/lib/speech/store";

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
  const saas = useSaasAlerts();
  // The set of downloads, not their progress (a string, so a progress tick doesn't re-render): the views read progress themselves.
  const transferKey = useVoiceManager((s) => Object.keys(s.downloads).join(" "));
  const transfers = React.useMemo(() => (transferKey ? transferKey.split(" ").map(transferActivity) : []), [transferKey]);
  const remuxTitle = useRemuxStatus((s) => s.job?.title ?? null);
  const remux = React.useMemo(() => (remuxTitle === null ? null : remuxActivity(remuxTitle)), [remuxTitle]);
  // Only while there are files to read (or it failed): a quiet check that finds nothing never shows.
  const scanLive = useMusicLibrary((s) => s.scan !== null && ((s.scan.phase === "scanning" && s.scan.toParse > 0) || s.scan.phase === "failed"));
  const scan = React.useMemo(() => (scanLive ? scanActivity() : null), [scanLive]);
  // Only the title and whether it's live: the views read the sentence themselves.
  const speechTitle = useSpeech((s) => (s.status === "idle" ? null : (s.source?.title ?? null)));
  const speechAt = useSpeech((s) => s.startedAt);
  const speech = React.useMemo(() => (speechTitle === null ? null : speechActivity(speechTitle)), [speechTitle]);
  const activities = React.useMemo(
    () => [
      ...(speech ? [speech] : []),
      ...orderTimers(timers).map(timerActivity),
      ...transfers,
      ...(remux ? [remux] : []),
      ...(scan ? [scan] : []),
      ...saas.map(saasAlertActivity),
      ...alerts.map((a) => moneyAlertActivity(a, today)),
    ],
    [speech, timers, transfers, remux, scan, saas, alerts, today],
  );
  // Whichever started last comes forward: a timer, or speech.
  const speechNewer = speech !== null && speechAt > lastStartedAt;
  const show = speechNewer ? SPEECH_ACTIVITY : (lastStarted ?? undefined);
  const showKey = speechNewer ? speechAt : lastStartedAt;

  if (!ready || activities.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-40 md:left-(--rail-w)">
      <LiveActivity activities={activities} show={show} showKey={showKey} />
    </div>
  );
}
