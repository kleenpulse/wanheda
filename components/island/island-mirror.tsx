"use client";

import * as React from "react";
import { useMoneyAlerts } from "@/components/island/money-alert-activity";
import { useSaasAlerts } from "@/components/island/saas-alert-activity";
import { useMusicLibrary } from "@/components/media/music-library";
import { useMusicPlayer } from "@/components/media/music-player";
import { useRemuxStatus } from "@/components/media/remux-status";
import { useVoiceManager } from "@/components/settings/voice-manager";
import { useActivity } from "@/lib/activity/store";
import { buildIslandSnapshot, sameSnapshot, type IslandSnapshot } from "@/lib/island/snapshot";
import { desktopBridge, isDesktop } from "@/lib/platform/desktop";
import { catalogVoice } from "@/lib/speech/voices";
import { useSpeech } from "@/lib/speech/store";

/** At most this often (ms), latest wins: a scan or a download ticks many times a second. */
const PUBLISH_EVERY = 250;

const noSubscribe = () => () => {};

/**
 * In the desktop app's main window: what the island shows, sent to the shell
 * for the floating island (V70) whenever it changes, throttled. Nothing on the web.
 */
export function IslandMirror() {
  const desktop = React.useSyncExternalStore(noSubscribe, isDesktop, () => false);
  return desktop ? <Mirror /> : null;
}

function Mirror() {
  const snapshot = useIslandSnapshot();
  const sent = React.useRef<IslandSnapshot | null>(null);
  const lastAt = React.useRef(0);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge || sameSnapshot(sent.current, snapshot)) return;
    const publish = () => {
      sent.current = snapshot;
      lastAt.current = Date.now();
      bridge.island.publish(snapshot);
    };
    const wait = PUBLISH_EVERY - (Date.now() - lastAt.current);
    if (wait <= 0) {
      publish();
      return;
    }
    // A newer snapshot replaces this one before it goes: latest wins.
    const t = setTimeout(publish, wait);
    return () => {
      clearTimeout(t);
    };
  }, [snapshot]);

  return null;
}

function useIslandSnapshot(): IslandSnapshot {
  const musicStatus = useMusicPlayer((s) => s.status);
  const track = useMusicPlayer((s) => s.track);
  const musicAt = useMusicPlayer((s) => s.startedAt);
  const speechStatus = useSpeech((s) => s.status);
  const source = useSpeech((s) => s.source);
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  const speechAt = useSpeech((s) => s.startedAt);
  const downloads = useVoiceManager((s) => s.downloads);
  const remux = useRemuxStatus((s) => s.job?.title ?? null);
  const scan = useMusicLibrary((s) => s.scan);
  const lastTimer = useActivity((s) => s.lastStarted);
  const lastTimerAt = useActivity((s) => s.lastStartedAt);
  const { alerts } = useMoneyAlerts();
  const saas = useSaasAlerts();

  return React.useMemo(
    () =>
      buildIslandSnapshot({
        music:
          musicStatus === "idle" || !track
            ? null
            : { title: track.title, artist: track.artist, coverKey: track.coverKey ?? null, playing: musicStatus === "playing", startedAt: musicAt },
        speech:
          speechStatus === "idle" || !source
            ? null
            : { title: source.title, sentence, total, paused: speechStatus === "paused", href: source.href ?? null, startedAt: speechAt },
        downloads: Object.values(downloads).map((d) => ({ id: d.id, label: catalogVoice(d.id)?.name ?? d.id, phase: d.phase, received: d.received, total: d.total })),
        remux,
        // Only while there are files to read, or it failed: a quiet check never shows (as on the page).
        scan:
          scan && ((scan.phase === "scanning" && scan.toParse > 0) || scan.phase === "failed")
            ? { failed: scan.phase === "failed", parsed: scan.parsed, toParse: scan.toParse }
            : null,
        alerts: [
          ...saas.map((a) => ({ id: `saas:${a.notice.id}`, noticeId: a.notice.id, tag: "income" as const, title: a.notice.title, body: a.notice.body, href: a.notice.href })),
          ...alerts.map((a) => ({ id: `money:${a.notice.id}`, noticeId: a.notice.id, tag: "money" as const, title: a.notice.title, body: a.notice.body, href: a.notice.href })),
        ],
        lastTimer,
        lastTimerAt,
      }),
    [musicStatus, track, musicAt, speechStatus, source, sentence, total, speechAt, downloads, remux, scan, lastTimer, lastTimerAt, alerts, saas],
  );
}
