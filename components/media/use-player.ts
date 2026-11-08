"use client";

import * as React from "react";
import { videoVolumePref } from "@/lib/media/cinema";
import { mediaSession, type SessionClaim } from "@/lib/media/session-owner";
import { volumeGain, type Volume } from "@/lib/media/volume";
import { rampAt } from "@/lib/media/sound-mix";
import { DUCK_RAMP, SOUND_FADE } from "@/lib/motion";
import type { MediaItem } from "@/lib/media/types";
import { usePlayer } from "./player-store";
import { usePlaybackTracking } from "./use-playback-tracking";

// Everything a playing `<video>` on /media joins (T62): resume and watched
// (V55), the tab's Media Session as the owner while it plays (V60; next and
// prev move through the library list, prev straight to the row above so the
// one playing keeps its saved place; seek keys step 10 s;
// ducked under speech in the Sound setting's duck mode), and the player store
// the palette and theatre mode read.

const STEP_S = 10;
const RAMP_TICK_MS = 16;

/** Sets the element to a volume pref: the slider's square as the level (as music does), mute as mute. */
export function applyVideoVolume(el: HTMLMediaElement, v: Volume): void {
  el.volume = volumeGain({ level: v.level, muted: false });
  el.muted = v.muted;
}

/**
 * Ramps a video's volume to a share of the owner's own level (V60). Timers,
 * not frames, so a ramp still finishes in a hidden tab.
 */
function elementDucker(el: HTMLMediaElement): { duck: (gain: number) => void; dispose: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  /** The owner's volume before the duck, restored when it lifts. */
  let base: number | null = null;
  let current = 1;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  return {
    duck: (gain) => {
      stop();
      base ??= el.volume;
      const from = el.volume;
      const to = base * gain;
      const duration = gain < current ? DUCK_RAMP.down : DUCK_RAMP.up;
      current = gain;
      const t0 = performance.now();
      const step = () => {
        const v = rampAt(from, to, duration, (performance.now() - t0) / 1000);
        el.volume = Math.min(1, Math.max(0, v));
        if (v !== to) return;
        stop();
        if (gain === 1) base = null;
      };
      timer = setInterval(step, RAMP_TICK_MS);
      step();
    },
    /** Unmount: no ramp left running, and the owner's own volume back at once (the next item's ducker reads it as its base). */
    dispose: () => {
      stop();
      if (base !== null) el.volume = base;
      base = null;
      current = 1;
    },
  };
}

function videoClaim(el: HTMLVideoElement, item: MediaItem, duck: (gain: number) => void, fader: ElementFader): SessionClaim {
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
        // Never music's restart-first: that would overwrite this video's saved place (owner, 2026-11-08).
        usePlayer.getState().step?.(-1);
      },
      seekbackward: (d) => {
        seek(-(d.seekOffset ?? STEP_S));
      },
      nexttrack: () => {
        usePlayer.getState().step?.(1);
      },
      seekforward: (d) => {
        seek(d.seekOffset ?? STEP_S);
      },
      seekto: (d) => {
        if (d.seekTime !== undefined) el.currentTime = d.seekTime;
      },
    },
    // The arbiter hears "paused" at once, not when the fade ends: a speech that lets go within
    // the fade must find the video paused, or it would never resume it (review FIX, B25).
    pause: () => {
      fader.out();
      mediaSession.setState("video", "paused");
    },
    resume: () => {
      const reversing = fader.fadingOut();
      fader.in();
      // A fade-out turned back never paused the element, so no "play" event says it plays again.
      if (reversing) mediaSession.setState("video", "playing");
    },
    duck,
  };
}

/** The video's own level, from the owner's setting (never a value read mid-ramp). */
function ownLevel(): number {
  return volumeGain({ level: videoVolumePref.get().level, muted: false });
}

export type ElementFader = {
  /** Fades to silence, then pauses; the owner's level is put back at once. */
  out: () => void;
  /** Plays again and fades in, or turns a fade-out still running back up. */
  in: () => void;
  /** A fade-out is running: the element hasn't paused yet. */
  fadingOut: () => boolean;
  dispose: () => void;
};

/**
 * Another sound taking over (V60): the video fades to silence, then pauses,
 * and its own volume is put back at once, so a play by hand is never silent.
 * When that sound lets go, it plays again and fades back in. Timers, as the
 * ducker. Every fade aims at the owner's setting, so a fade cut short by
 * another never leaves the video stuck low.
 */
export function elementFader(el: HTMLMediaElement, level: () => number = ownLevel): ElementFader {
  let timer: ReturnType<typeof setInterval> | null = null;
  let fading: "out" | "in" | null = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    fading = null;
  };
  const ramp = (to: number, seconds: number, kind: "out" | "in", done?: () => void) => {
    stop();
    fading = kind;
    const from = el.volume;
    const t0 = performance.now();
    const step = () => {
      const v = rampAt(from, to, seconds, (performance.now() - t0) / 1000);
      el.volume = Math.min(1, Math.max(0, v));
      if (v !== to) return;
      stop();
      done?.();
    };
    timer = setInterval(step, RAMP_TICK_MS);
    step();
  };
  return {
    out: () => {
      if (el.paused) return;
      ramp(0, SOUND_FADE.out, "out", () => {
        el.pause();
        el.volume = level();
      });
    },
    in: () => {
      if (fading === "out") {
        ramp(level(), SOUND_FADE.in, "in");
        return;
      }
      if (!el.paused || el.ended) return;
      el.volume = 0;
      el.play().then(
        () => {
          ramp(level(), SOUND_FADE.in, "in");
        },
        () => {
          el.volume = level();
        },
      );
    },
    fadingOut: () => fading === "out",
    dispose: () => {
      const was = fading;
      stop();
      if (was) el.volume = level();
    },
  };
}

export function usePlayerWiring(video: React.RefObject<HTMLVideoElement | null>, mounted: number, item: MediaItem): void {
  usePlaybackTracking(video, mounted, item);

  // Picture in picture on a player that's going (any way: a row, the keys, the PiP window's own
  // next, autoplay, closing): hand it to the next player (V65). A layout cleanup runs before
  // React removes the node, while the element is still the PiP element.
  React.useLayoutEffect(() => {
    const el = video.current;
    if (!el) return;
    return () => {
      if (document.pictureInPictureElement === el) usePlayer.getState().startCarry();
    };
  }, [video, mounted]);

  React.useEffect(() => {
    const el = video.current;
    if (!el) return;
    usePlayer.getState().register(el, item.title, item.id);
    // The video's own volume (T72), before the ducker reads it as the owner's level.
    applyVideoVolume(el, videoVolumePref.get());
    const ducker = elementDucker(el);
    const fader = elementFader(el);
    const onPlay = () => {
      mediaSession.claim(videoClaim(el, item, ducker.duck, fader), true);
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
      fader.dispose();
      ducker.dispose();
      usePlayer.getState().unregister(el);
    };
  }, [video, mounted, item]);
}
