"use client";

import * as React from "react";
import { mediaSession, type SessionClaim } from "@/lib/media/session-owner";
import type { MediaItem } from "@/lib/media/types";
import { usePlayer } from "./player-store";
import { usePlaybackTracking } from "./use-playback-tracking";

// Everything a playing `<video>` on /media joins (T62): resume and watched
// (V55), the tab's Media Session as the owner while it plays (V60; prev and
// next step 10 s), and the player store the palette and theatre mode read.

const STEP_S = 10;

function videoClaim(el: HTMLVideoElement, item: MediaItem): SessionClaim {
  const seek = (by: number) => {
    const end = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.min(end, Math.max(0, el.currentTime + by));
  };
  return {
    id: "video",
    metadata: { title: item.title, artist: item.kind === "audio" ? "Audio" : "Video", album: "Wanheda" },
    handlers: {
      play: () => {
        void el.play().catch(() => undefined);
      },
      pause: () => {
        el.pause();
      },
      stop: () => {
        el.pause();
      },
      previoustrack: () => {
        seek(-STEP_S);
      },
      seekbackward: (d) => {
        seek(-(d.seekOffset ?? STEP_S));
      },
      nexttrack: () => {
        seek(STEP_S);
      },
      seekforward: (d) => {
        seek(d.seekOffset ?? STEP_S);
      },
      seekto: (d) => {
        if (d.seekTime !== undefined) el.currentTime = d.seekTime;
      },
    },
    pause: () => {
      el.pause();
    },
  };
}

export function usePlayerWiring(video: React.RefObject<HTMLVideoElement | null>, mounted: number, item: MediaItem): void {
  usePlaybackTracking(video, mounted, item);

  React.useEffect(() => {
    const el = video.current;
    if (!el) return;
    usePlayer.getState().register(el, item.title);
    const onPlay = () => {
      mediaSession.claim(videoClaim(el, item), true);
      mediaSession.setState("video", "playing");
    };
    const onPause = () => {
      mediaSession.setState("video", "paused");
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    if (!el.paused) onPlay();
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      mediaSession.release("video");
      usePlayer.getState().unregister(el);
    };
  }, [video, mounted, item]);
}
