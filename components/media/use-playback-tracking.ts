"use client";

import * as React from "react";
import { useAccount } from "@/components/shell/account";
import { writesDue } from "@/lib/media/playback";
import { isWatched, resumeAt } from "@/lib/media/resume";
import { resumeModePref } from "@/lib/media/resume-mode";
import type { MediaItem, MediaProgress } from "@/lib/media/types";
import { usePlayback } from "./playback-store";
import { usePlayer } from "./player-store";

// Resume and watched for one playing item (V55): a saved place (resumeAt:
// past 10 s and short of the last 30 s, each capped at 10 % of the length,
// never a watched one) is taken as Settings → Sound says — ask (opens paused
// there, Resume | Start over in the stage; play = Resume), resume, or start
// over. Saves locally every 5 s while playing, to the server every 15 s, and
// both at once on pause, end, hide and page close (the last by beacon).

/** Wires one element; returns the teardown (which saves the place as a pause). */
function track(el: HTMLVideoElement, itemId: string, opening: MediaProgress | null, demo: boolean): () => void {
  const last = { local: 0, server: 0 };
  // `watched` is sticky: rewatching a finished item never un-marks it (only a
  // future explicit unmark would).
  const state: { resumed: boolean; watched: boolean; choice: "resume" | "start" | "asking" | null } = {
    resumed: false,
    watched: opening?.watched ?? false,
    choice: null,
  };
  const at = () => resumeAt(opening, Number.isFinite(el.duration) ? el.duration : null);
  const stopAsking = () => {
    if (usePlayer.getState().ask?.itemId === itemId) usePlayer.getState().setAsk(null);
  };
  const answer = (choice: "resume" | "start") => {
    if (state.choice !== "asking") return;
    state.choice = choice;
    stopAsking();
    if (choice === "start") el.currentTime = 0;
    void el.play().catch(() => undefined);
  };

  const write = (reason: "tick" | "pause" | "ended" | "hidden", beacon = false) => {
    const duration = Number.isFinite(el.duration) ? el.duration : null;
    if (!state.resumed || duration === null || el.currentTime === 0) return;
    const now = Date.now();
    const due = writesDue(now, last, reason);
    if (!due.local) return;
    last.local = now;
    if (due.server) last.server = now;
    state.watched = state.watched || isWatched(el.currentTime, duration, reason === "ended" || el.ended);
    usePlayback.getState().record(itemId, { positionS: el.currentTime, watched: state.watched }, due.server ? (beacon ? "beacon" : "fetch") : "none", demo);
  };

  // Autoplay and Play now move on before the end: the item still counts as watched (T72).
  const finish = () => {
    state.watched = true;
    write("ended");
  };
  usePlayer.getState().setFinish(finish);

  const onMeta = () => {
    if (state.resumed) return;
    state.resumed = true;
    const place = at();
    if (place <= 0) return;
    // Decided once per opening: a source swap (remux) re-applies it without asking again.
    if (state.choice === null) {
      const mode = resumeModePref.get();
      // A hidden tab (a headset or lock-screen next) has nobody to see the prompt: resume.
      state.choice = mode === "ask" ? (document.visibilityState === "hidden" ? "resume" : "asking") : mode;
    }
    if (state.choice === "start") return;
    el.currentTime = place;
    if (state.choice !== "asking") return;
    // The opener's play() is already on its way: hold it here, on the frame it would resume from.
    el.pause();
    usePlayer.getState().setAsk({ itemId, at: place, answer });
  };
  /** Play while asking (the skin's button, Space, the play key) is a Resume. */
  const onPlay = () => {
    if (state.choice !== "asking" || !state.resumed) return;
    state.choice = "resume";
    stopAsking();
  };
  // A source swap (native load error ⇒ remux on the same element) starts at 0
  // again, so it must resume again, not overwrite the saved place.
  const onEmptied = () => {
    state.resumed = false;
  };
  const onTime = () => {
    if (!el.paused) write("tick");
  };
  const onPause = () => {
    if (!el.ended) write("pause");
  };
  const onEnded = () => {
    write("ended");
  };
  const onHidden = () => {
    if (document.visibilityState === "hidden") write("hidden", true);
  };
  const onPageHide = () => {
    write("hidden", true);
  };

  if (el.readyState >= el.HAVE_METADATA) onMeta();
  el.addEventListener("loadedmetadata", onMeta);
  el.addEventListener("emptied", onEmptied);
  el.addEventListener("timeupdate", onTime);
  el.addEventListener("play", onPlay);
  el.addEventListener("pause", onPause);
  el.addEventListener("ended", onEnded);
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    // Leaving the item (another one, or another app) counts as a pause.
    if (!el.paused) write("pause");
    stopAsking();
    if (usePlayer.getState().finish === finish) usePlayer.getState().setFinish(null);
    el.removeEventListener("loadedmetadata", onMeta);
    el.removeEventListener("emptied", onEmptied);
    el.removeEventListener("timeupdate", onTime);
    el.removeEventListener("play", onPlay);
    el.removeEventListener("pause", onPause);
    el.removeEventListener("ended", onEnded);
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onPageHide);
  };
}

export function usePlaybackTracking(video: React.RefObject<HTMLVideoElement | null>, mounted: number, item: MediaItem): void {
  const demo = useAccount().kind !== "owner";
  // The place as it was when the item opened: our own later writes must not re-seek.
  const [opening] = React.useState(item.progress);

  React.useEffect(() => {
    const el = video.current;
    if (!el) return;
    return track(el, item.id, opening, demo);
  }, [video, mounted, item.id, opening, demo]);
}
