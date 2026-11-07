"use client";

import * as React from "react";
import { useAccount } from "@/components/shell/account";
import { writesDue } from "@/lib/media/playback";
import { isWatched, resumeAt } from "@/lib/media/resume";
import type { MediaItem, MediaProgress } from "@/lib/media/types";
import { usePlayback } from "./playback-store";

// Resume and watched for one playing item (V55): starts where it was left
// (10 s < pos < duration − 30 s, never a watched one), saves locally every
// 5 s while playing, to the server every 15 s, and both at once on pause,
// end, hide and page close (the last by beacon).

/** Wires one element; returns the teardown (which saves the place as a pause). */
function track(el: HTMLVideoElement, itemId: string, opening: MediaProgress | null, demo: boolean): () => void {
  const last = { local: 0, server: 0 };
  // `watched` is sticky: rewatching a finished item never un-marks it (only a
  // future explicit unmark would).
  const state = { resumed: false, watched: opening?.watched ?? false };

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

  const onMeta = () => {
    if (state.resumed) return;
    state.resumed = true;
    const at = resumeAt(opening, Number.isFinite(el.duration) ? el.duration : null);
    if (at > 0) el.currentTime = at;
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
  el.addEventListener("pause", onPause);
  el.addEventListener("ended", onEnded);
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    // Leaving the item (another one, or another app) counts as a pause.
    if (!el.paused) write("pause");
    el.removeEventListener("loadedmetadata", onMeta);
    el.removeEventListener("emptied", onEmptied);
    el.removeEventListener("timeupdate", onTime);
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
