"use client";

import { create } from "zustand";
import { srtToVtt } from "@/lib/media/subtitles";

// The video playing on /media, for the palette's player commands and the
// stage's theatre mode. One at a time: the stage registers its element while
// mounted. Theatre is a device pref (the screen decides it, not the account).

const THEATRE_KEY = "wanheda-media-theatre";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Player actions done the skin's way, so its buttons stay in step (from `<MediaSurface>`). */
export type SurfaceControls = { toggleFullscreen: () => void; togglePictureInPicture: () => void };

type PlayerState = {
  el: HTMLVideoElement | null;
  controls: SurfaceControls | null;
  setControls: (controls: SurfaceControls | null) => void;
  title: string | null;
  theatre: boolean;
  /** Frees the sidecar subtitle tracks added to the current element. */
  dropSubtitles: (() => void)[];
  register: (el: HTMLVideoElement, title: string) => void;
  /** Adds a picked or dropped .srt|.vtt to the playing video; false when nothing plays. */
  subtitles: (file: File) => Promise<boolean>;
  unregister: (el: HTMLVideoElement) => void;
  setTheatre: (on: boolean) => void;
};

function readTheatre(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(THEATRE_KEY) === "1";
  } catch {
    return false;
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  el: null,
  controls: null,
  setControls: (controls) => {
    set({ controls });
  },
  title: null,
  theatre: false,
  dropSubtitles: [],
  register: (el, title) => {
    set({ el, title, theatre: readTheatre() });
  },
  unregister: (el) => {
    if (get().el !== el) return;
    for (const drop of get().dropSubtitles) drop();
    set({ el: null, title: null, dropSubtitles: [] });
  },
  subtitles: async (file) => {
    const el = get().el;
    if (!el) return false;
    const drop = await addSubtitles(el, file);
    if (get().el !== el) {
      drop();
      return false;
    }
    set((s) => ({ dropSubtitles: [...s.dropSubtitles, drop] }));
    return true;
  },
  setTheatre: (on) => {
    try {
      localStorage.setItem(THEATRE_KEY, on ? "1" : "0");
    } catch {
      // Private mode: this tab only.
    }
    set({ theatre: on });
  },
}));

/** Player commands for the palette, on whatever video is playing (none: no-op). */
export const playerActions = {
  toggle(): void {
    const el = usePlayer.getState().el;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  },
  seek(by: number): void {
    const el = usePlayer.getState().el;
    if (!el) return;
    const end = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.min(end, Math.max(0, el.currentTime + by));
  },
  speed(dir: 1 | -1): void {
    const el = usePlayer.getState().el;
    if (el) el.playbackRate = stepSpeed(el.playbackRate, dir);
  },
};

/** The next speed step up or down from `rate`, within 0.5–2×. */
export function stepSpeed(rate: number, dir: 1 | -1): number {
  if (dir > 0) return SPEEDS.find((s) => s > rate + 0.01) ?? 2;
  return [...SPEEDS].reverse().find((s) => s < rate - 0.01) ?? 0.5;
}

/**
 * Adds a sidecar subtitle file (V57): VTT as is, SRT converted. Cue text
 * stays text (a `<track>` never renders HTML). Shown at once; returns a
 * cleanup that removes the track and frees its URL.
 */
export async function addSubtitles(el: HTMLVideoElement, file: File): Promise<() => void> {
  const raw = await file.text();
  const vtt = /\.srt$/i.test(file.name) || !raw.trimStart().startsWith("WEBVTT") ? srtToVtt(raw) : raw;
  const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  const track = document.createElement("track");
  track.kind = "subtitles";
  track.label = file.name.replace(/\.(srt|vtt)$/i, "").slice(0, 60) || "Subtitles";
  track.src = url;
  track.default = true;
  el.append(track);
  // One subtitle track shows at a time: the new one.
  for (const t of Array.from(el.textTracks)) if (t !== track.track && t.mode === "showing") t.mode = "hidden";
  track.track.mode = "showing";
  return () => {
    track.remove();
    URL.revokeObjectURL(url);
  };
}

export const SUBTITLE_ACCEPT = ".srt,.vtt";
