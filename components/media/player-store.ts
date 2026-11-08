"use client";

import { create } from "zustand";
import { toast } from "@/components/ui/toaster";
import { srtToVtt } from "@/lib/media/subtitles";

// The video playing on /media, for the palette's player commands and the
// player's chrome. One at a time: the stage registers its element while
// mounted. Theatre is a device pref (the screen decides it, not the account).

const THEATRE_KEY = "wanheda-media-theatre";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const PLAYER_SPEEDS: readonly number[] = SPEEDS;

/** Player actions done the chrome's way, so its buttons stay in step (registered by the chrome, T72). */
export type SurfaceControls = { toggleFullscreen: () => void; togglePictureInPicture: () => void };

/** A line the chrome shows over the picture while it fills the screen (a toast can't show there). */
export type PlayerStatus = { id: number; text: string };

type PlayerState = {
  el: HTMLVideoElement | null;
  controls: SurfaceControls | null;
  setControls: (controls: SurfaceControls | null) => void;
  /** The chrome's frame: what goes full screen, and where its menus and tooltips render (V65). */
  root: HTMLElement | null;
  setRoot: (root: HTMLElement | null) => void;
  title: string | null;
  /** The library item `el` plays: a frame shows its chrome only for its own item (T72 FIX: an item change commits before the old element unregisters). */
  itemId: string | null;
  theatre: boolean;
  /** The local file can't play (the stage shows why): no chrome over the notice. */
  failed: boolean;
  setFailed: (failed: boolean) => void;
  /** Run when the element goes (before its object URL is revoked): sidecar tracks, the scrub preview. */
  releases: (() => void)[];
  /** Adds a cleanup that runs when `el` is unregistered (at once if it already has been). */
  onRelease: (el: HTMLVideoElement, release: () => void) => void;
  register: (el: HTMLVideoElement, title: string, itemId: string) => void;
  /** Adds a picked or dropped .srt|.vtt to the playing video and shows it; false when nothing plays. */
  subtitles: (file: File) => Promise<boolean>;
  /** The subtitle track the chrome draws (V57: tracks stay hidden, the app draws the cues), or null for off. */
  track: TextTrack | null;
  /** The last one shown, so `c` brings it back. */
  lastTrack: TextTrack | null;
  setTrack: (track: TextTrack | null) => void;
  unregister: (el: HTMLVideoElement) => void;
  setTheatre: (on: boolean) => void;
  /** Opens the next (1) or previous (-1) item in the library list; false at an end. Set by the videos view. */
  step: ((dir: 1 | -1) => boolean) | null;
  setStep: (step: ((dir: 1 | -1) => boolean) | null) => void;
  /** A video opened paused at its saved place, waiting for Resume or Start over (resume mode "ask"). */
  ask: ResumeAsk | null;
  setAsk: (ask: ResumeAsk | null) => void;
  /** Marks the playing item watched and saves it now (the tracker sets it): autoplay and Play now call it before moving on, so a skip at 92 % still counts (T72). */
  finish: (() => void) | null;
  setFinish: (finish: (() => void) | null) => void;
  /**
   * Picture in picture was open on a player that just went (ms), or 0 (V65): the next player
   * claims it and takes the window over; unclaimed for CARRY_CLAIM_MS, the window is closed.
   * Never a window frozen on a removed video.
   */
  carryPip: number;
  /** A player in picture in picture is going (its wiring's cleanup, before the node is removed). */
  startCarry: () => void;
  /** The next player takes the carry: true if there was one to take. */
  claimCarry: () => boolean;
  /** Closes the window nobody claimed (or that the new player couldn't take). */
  endCarry: (why?: string) => void;
  status: PlayerStatus | null;
  /** Feedback from the player: a toast, or the status line while the player fills the screen. */
  notify: (title: string, body?: string) => void;
};

export type ResumeAsk = { itemId: string; at: number; answer: (choice: "resume" | "start") => void };

function readTheatre(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(THEATRE_KEY) === "1";
  } catch {
    return false;
  }
}

const STATUS_MS = 3000;
/** How long a carried picture-in-picture window waits for the next player before it closes. */
export const CARRY_CLAIM_MS = 3000;
let carryTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;
let statusId = 0;

/** Lets only `track` load cues (hidden: the chrome draws them); every other track stops. */
function selectTrack(el: HTMLVideoElement | null, track: TextTrack | null): void {
  if (!el) return;
  for (const t of Array.from(el.textTracks)) {
    if (t === track) t.mode = "hidden";
    else if (t.mode !== "disabled") t.mode = "disabled";
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  el: null,
  controls: null,
  setControls: (controls) => {
    set({ controls });
  },
  root: null,
  setRoot: (root) => {
    set({ root });
  },
  title: null,
  itemId: null,
  theatre: false,
  failed: false,
  setFailed: (failed) => {
    set({ failed });
  },
  releases: [],
  onRelease: (el, release) => {
    if (get().el !== el) {
      release();
      return;
    }
    set((s) => ({ releases: [...s.releases, release] }));
  },
  register: (el, title, itemId) => {
    set({ el, title, itemId, theatre: readTheatre(), failed: false, track: null, lastTrack: null });
  },
  unregister: (el) => {
    if (get().el !== el) return;
    for (const release of get().releases) release();
    set({ el: null, title: null, itemId: null, releases: [], track: null, lastTrack: null, failed: false });
  },
  subtitles: async (file) => {
    const el = get().el;
    if (!el) return false;
    const added = await addSubtitles(el, file);
    if (get().el !== el) {
      added.drop();
      return false;
    }
    get().onRelease(el, added.drop);
    get().setTrack(added.track);
    return true;
  },
  track: null,
  lastTrack: null,
  setTrack: (track) => {
    selectTrack(get().el, track);
    set((s) => ({ track, lastTrack: track ?? s.lastTrack }));
  },
  setTheatre: (on) => {
    try {
      localStorage.setItem(THEATRE_KEY, on ? "1" : "0");
    } catch {
      // Private mode: this tab only.
    }
    set({ theatre: on });
  },
  step: null,
  setStep: (step) => {
    set({ step });
  },
  ask: null,
  setAsk: (ask) => {
    set({ ask });
  },
  finish: null,
  setFinish: (finish) => {
    set({ finish });
  },
  carryPip: 0,
  startCarry: () => {
    if (carryTimer) clearTimeout(carryTimer);
    set({ carryPip: Date.now() });
    carryTimer = setTimeout(() => {
      if (get().carryPip) get().endCarry("The next video didn't open here, so it closed.");
    }, CARRY_CLAIM_MS);
  },
  claimCarry: () => {
    if (!get().carryPip) return false;
    if (carryTimer) clearTimeout(carryTimer);
    carryTimer = null;
    set({ carryPip: 0 });
    return true;
  },
  endCarry: (why) => {
    if (carryTimer) clearTimeout(carryTimer);
    carryTimer = null;
    set({ carryPip: 0 });
    if (typeof document !== "undefined" && document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
      get().notify("Picture in picture closed", why);
    }
  },
  status: null,
  notify: (title, body) => {
    const root = get().root;
    const full = typeof document !== "undefined" && root !== null && document.fullscreenElement === root;
    if (!full) {
      toast(body === undefined ? { title } : { title, body });
      return;
    }
    if (statusTimer) clearTimeout(statusTimer);
    statusId += 1;
    const id = statusId;
    set({ status: { id, text: body ? `${title}. ${body}` : title } });
    statusTimer = setTimeout(() => {
      if (get().status?.id === id) set({ status: null });
    }, STATUS_MS);
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
 * Adds a sidecar subtitle file (V57): VTT as is, SRT converted. The track is
 * `hidden`, never `showing`: the chrome draws its cues as text above the
 * controls. Returns the track and a cleanup that removes it and frees its URL.
 */
export async function addSubtitles(el: HTMLVideoElement, file: File): Promise<{ track: TextTrack; drop: () => void }> {
  const raw = await file.text();
  const vtt = /\.srt$/i.test(file.name) || !raw.trimStart().startsWith("WEBVTT") ? srtToVtt(raw) : raw;
  const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  const track = document.createElement("track");
  track.kind = "subtitles";
  track.label = file.name.replace(/\.(srt|vtt)$/i, "").slice(0, 60) || "Subtitles";
  track.src = url;
  el.append(track);
  track.track.mode = "hidden";
  return {
    track: track.track,
    drop: () => {
      track.remove();
      URL.revokeObjectURL(url);
    },
  };
}

export const SUBTITLE_ACCEPT = ".srt,.vtt";

/** Moves the element to `t` seconds, within its length. (A helper, so components never assign to a prop.) */
export function seekElement(el: HTMLMediaElement, t: number): void {
  const end = Number.isFinite(el.duration) ? el.duration : Infinity;
  el.currentTime = Math.min(end, Math.max(0, t));
}

/** Sets the element's speed. */
export function setElementRate(el: HTMLMediaElement, rate: number): void {
  el.playbackRate = rate;
}
