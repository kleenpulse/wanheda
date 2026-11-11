"use client";

import * as React from "react";
import { useActivitySync } from "@/components/island/activity-sync";
import { LiveActivity, type IslandActivity } from "@/components/island/live-activity";
import { mediaActivity } from "@/components/island/media-activity";
import { remuxActivity } from "@/components/island/remux-activity";
import { scanActivity } from "@/components/island/scan-activity";
import { moneyAlertActivity, useMoneyAlerts } from "@/components/island/money-alert-activity";
import { saasAlertActivity, useSaasAlerts } from "@/components/island/saas-alert-activity";
import { speechActivity } from "@/components/island/speech-activity";
import { orderTimers, timerActivity } from "@/components/island/timer-activity";
import { useFloatingIsland } from "@/components/island/floating-store";
import { useIslandShown } from "@/components/island/island-shown";
import { transferActivity } from "@/components/island/transfer-activity";
import { useMusicLibrary } from "@/components/media/music-library";
import { useMusicPlayer } from "@/components/media/music-player";
import { useRemuxStatus } from "@/components/media/remux-status";
import { useVoiceManager } from "@/components/settings/voice-manager";
import { rankActivities, type Ranked } from "@/lib/activity/priority";
import { useActivity } from "@/lib/activity/store";
import { useSpeech } from "@/lib/speech/store";

/**
 * The island at the top centre of the content column (FR-ISLAND-1). It lives
 * in the shell frame, so it survives navigation between apps. Order is by
 * priority (V61): media and speech, then timers, transfers and alerts, the
 * newest started first within each; the leader comes forward when it changes.
 * Order is decided when the set changes, not on every tick, so the pill
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
  // Live while the player holds a song, playing or paused (V61): only its title, the views read the rest.
  const musicTitle = useMusicPlayer((s) => (s.status === "idle" ? null : (s.track?.title ?? null)));
  const musicAt = useMusicPlayer((s) => s.startedAt);
  const media = React.useMemo(() => (musicTitle === null ? null : mediaActivity(musicTitle)), [musicTitle]);
  // The now-playing bar on Media Home and Music holds the music: the island leaves its card out meanwhile (V61, V66).
  const musicHeld = useActivity((s) => s.musicHeld > 0);
  const ranked = React.useMemo(() => {
    const all: Ranked<IslandActivity>[] = [
      ...(media ? [{ item: media, kind: "media" as const, startedAt: musicAt }] : []),
      ...(speech ? [{ item: speech, kind: "speech" as const, startedAt: speechAt }] : []),
      ...orderTimers(timers).map((t) => ({ item: timerActivity(t), kind: "timer" as const, startedAt: t.id === lastStarted ? lastStartedAt : 0 })),
      ...[...transfers, ...(remux ? [remux] : []), ...(scan ? [scan] : [])].map((item) => ({ item, kind: "transfer" as const, startedAt: 0 })),
      ...[...saas.map(saasAlertActivity), ...alerts.map((a) => moneyAlertActivity(a, today))].map((item) => ({ item, kind: "alert" as const, startedAt: 0 })),
    ];
    return rankActivities(all, musicHeld ? ["media"] : []);
  }, [musicHeld, media, musicAt, speech, speechAt, timers, lastStarted, lastStartedAt, transfers, remux, scan, saas, alerts, today]);
  const activities = React.useMemo(() => ranked.map((r) => r.item), [ranked]);
  // The leader comes forward when it changes, or when it starts again.
  const show = ranked[0]?.item.id;
  const showKey = ranked[0]?.startedAt;

  // The desktop shell's floating island is showing all this while the window is in the background (V70).
  const floating = useFloatingIsland((s) => s.floating);
  // The owner can turn the island off on this device (Settings → Island).
  const shown = useIslandShown();

  if (!ready || !shown || activities.length === 0 || floating) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--tb)+0.5rem)] z-40 md:left-(--rail-w)">
      <LiveActivity activities={activities} show={show} showKey={showKey} />
    </div>
  );
}
