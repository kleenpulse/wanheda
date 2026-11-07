"use client";

import { create } from "zustand";
import { toast } from "@/components/ui/toaster";
import type { Track } from "@/lib/media/library";
import type { MusicEngine } from "@/lib/media/music-engine";
import { mediaSession, type SessionClaim } from "@/lib/media/session-owner";
import { isTonePath } from "@/lib/media/tones";
import { nudgeVolume, volumeGain, volumePref } from "@/lib/media/volume";
import {
  currentItem,
  cycleRepeat,
  followingIndex,
  moveTo,
  precedingIndex,
  PREV_RESTART_S,
  setShuffle,
  startQueue,
  type Queue,
  type Repeat,
} from "@/lib/media/queue";
import { FolderAccessError, musicFile } from "./music-library";

// The music player (T64, V59, V60): one per tab, the one place music is
// started, steered and stopped. The Music list, the island's media card, the
// player window, Home's widget and the palette all drive this store, so they
// never disagree. It lives in the shell, so a hop between apps never stops
// the sound or rebuilds the audio graph (V62).
//
// - Controls change state at once; the engine catches up.
// - Music is one owner of the tab's Media Session (V60): the OS keys steer it
//   while it owns them, and the Sound setting decides how it shares the
//   speakers with speech and video.

export type MusicStatus = "idle" | "playing" | "paused";

type State = {
  queue: Queue<Track> | null;
  status: MusicStatus;
  /** Between a press and its first sound: opening and decoding. */
  loading: boolean;
  /** The track playing (or paused). */
  track: Track | null;
  /** Seconds into it, refreshed a few times a second while playing. */
  position: number;
  /** Its exact playable length once open; the index's duration before that. */
  duration: number | null;
  /** When playing last started (Date.now()): the island ranks by it (V61). */
  startedAt: number;
  shuffle: boolean;
  repeat: Repeat;

  /** Plays `tracks[index]` and queues the rest of the list after it. */
  playList: (tracks: readonly Track[], index: number) => void;
  /** Plays the queue's item `index` (a pick from Up next). */
  jump: (index: number) => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  seekBy: (seconds: number) => void;
  stop: () => void;
  setShuffle: (on: boolean) => void;
  cycleRepeat: () => void;
  /** Volume 0–1 (kept on this device, like mute). */
  setVolume: (level: number) => void;
  /** Up or down a step; up from mute unmutes. */
  nudgeVolume: (by: number) => void;
  toggleMute: () => void;
};

const TICK_MS = 250;
const STEP_S = 10;

let engine: MusicEngine | null = null;
let enginePromise: Promise<MusicEngine> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

/** Starts loading the engine (and Mediabunny) before the first press, so play feels instant. */
export function preloadMusicEngine(): void {
  void loadEngine().catch(() => undefined);
}

function loadEngine(): Promise<MusicEngine> {
  enginePromise ??= import("@/lib/media/music-engine").then(({ MusicEngine, PlayError, openFile, openTone }) => {
    const e = new MusicEngine(
      {
        open: async (key, ctx) => {
          const t = useMusicPlayer.getState().queue?.items[key];
          if (!t) throw new PlayError("That track left the queue.");
          if (isTonePath(t.path)) return openTone(t.path, t.durationS ?? 60, ctx);
          const file = await musicFile(t.path).catch((err: unknown) => {
            // No access to the folder: every next track would fail (and ask) the same way.
            throw new PlayError(err instanceof Error ? err.message : "The file couldn't be read.", { stop: err instanceof FolderAccessError });
          });
          return openFile(file);
        },
        following: (key, auto) => {
          const q = useMusicPlayer.getState().queue;
          return q ? followingIndex(q, key, auto) : null;
        },
      },
      {
        onTrack: (key, durationS) => {
          const s = useMusicPlayer.getState();
          if (!s.queue) return;
          const queue = moveTo(s.queue, key);
          const track = currentItem(queue);
          const changed = track !== s.track;
          useMusicPlayer.setState({ queue, track, duration: durationS, loading: false, ...(changed ? { position: 0 } : {}) });
          if (changed && track) mediaSession.claim(musicClaim(track), false);
        },
        onEnd: () => {
          const s = useMusicPlayer.getState();
          if (!s.queue) return;
          // The queue ran out: back to its start, paused, so play starts it over.
          const first = s.queue.order[0];
          const queue = first === undefined ? s.queue : moveTo(s.queue, first);
          useMusicPlayer.setState({ queue, track: currentItem(queue), status: "paused", loading: false, position: 0 });
          stopTicker();
          mediaSession.setState("music", "paused");
        },
        onError: (key, message) => {
          const t = useMusicPlayer.getState().queue?.items[key];
          toast({ title: `Couldn't play ${t?.title ?? "a track"}`, body: message });
        },
      },
    );
    e.setVolume(volumeGain(volumePref.get()));
    engine = e;
    return e;
  });
  return enginePromise;
}

function withEngine(fn: (e: MusicEngine) => void): void {
  if (engine) fn(engine);
  else
    void loadEngine().then(fn, () => {
      toast({ title: "The music player didn't load", body: "Check your connection and try again." });
      useMusicPlayer.setState({ status: "paused", loading: false });
    });
}

function setVolumePref(v: Parameters<typeof volumePref.set>[0]): void {
  volumePref.set(v);
  engine?.setVolume(volumeGain(v));
}

/** The equalizer's view of the sound: fills `out` with frequency bins; false while nothing plays. */
export function musicLevels(out: Uint8Array<ArrayBuffer>): boolean {
  return engine?.levels(out) ?? false;
}

/** Seconds into the current track by the audio clock, between ticks (the scrub glides on it); null when unknown. */
export function musicPosition(): number | null {
  const p = engine?.position();
  const q = useMusicPlayer.getState().queue;
  return p && q?.order[q.at] === p.key ? p.seconds : null;
}

function startTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const p = engine?.position();
    const s = useMusicPlayer.getState();
    if (p && s.queue && s.queue.order[s.queue.at] === p.key && Math.abs(p.seconds - s.position) > 0.05) useMusicPlayer.setState({ position: p.seconds });
  }, TICK_MS);
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function musicClaim(t: Track): SessionClaim {
  const player = () => useMusicPlayer.getState();
  return {
    id: "music",
    metadata: { title: t.title, artist: t.artist, album: t.album },
    handlers: {
      play: () => {
        player().resume();
      },
      pause: () => {
        player().pause();
      },
      stop: () => {
        player().stop();
      },
      previoustrack: () => {
        player().prev();
      },
      nexttrack: () => {
        player().next();
      },
      seekbackward: (d) => {
        player().seekBy(-(d.seekOffset ?? STEP_S));
      },
      seekforward: (d) => {
        player().seekBy(d.seekOffset ?? STEP_S);
      },
      seekto: (d) => {
        if (d.seekTime !== undefined) player().seek(d.seekTime);
      },
    },
    pause: () => {
      if (player().status === "playing") player().pause();
    },
    duck: (gain) => {
      engine?.duck(gain);
    },
  };
}

export const useMusicPlayer = create<State>((set, get) => {
  /** Starts item `index` of the current queue from `from` seconds: takes the keys and the speakers. */
  const startAt = (index: number, from: number) => {
    const q = get().queue;
    if (!q) return;
    const queue = moveTo(q, index);
    const track = currentItem(queue);
    if (!track) return;
    const startedAt = Date.now();
    set({ queue, track, status: "playing", loading: true, position: from, duration: track.durationS, startedAt });
    mediaSession.claim(musicClaim(track), true);
    mediaSession.setState("music", "playing");
    startTicker();
    withEngine((e) => {
      // Loading the engine took a moment: a pause, a stop or another pick since then wins.
      const now = get();
      if (now.status !== "playing" || now.queue?.order[now.queue.at] !== index || now.startedAt !== startedAt) return;
      e.play(index, from);
    });
  };

  return {
    queue: null,
    status: "idle",
    loading: false,
    track: null,
    position: 0,
    duration: null,
    startedAt: 0,
    shuffle: false,
    repeat: "off",

    playList: (tracks, index) => {
      if (tracks.length === 0) return;
      const { shuffle, repeat } = get();
      const queue = startQueue([...tracks], index, { shuffle, repeat });
      set({ queue });
      const at = queue.order[queue.at];
      if (at !== undefined) startAt(at, 0);
    },

    jump: (index) => {
      startAt(index, 0);
    },

    toggle: () => {
      if (get().status === "playing") get().pause();
      else get().resume();
    },

    pause: () => {
      if (get().status !== "playing") return;
      set({ status: "paused" });
      engine?.pause();
      stopTicker();
      mediaSession.setState("music", "paused");
    },

    resume: () => {
      const s = get();
      if (s.status === "playing" || !s.queue || !s.track) return;
      // Nothing scheduled (the queue ended, or the engine never started): play from where it shows.
      const pos = engine?.position();
      if (!pos) {
        const index = s.queue.order[s.queue.at];
        if (index !== undefined) startAt(index, s.position);
        return;
      }
      set({ status: "playing", startedAt: Date.now() });
      mediaSession.claim(musicClaim(s.track), true);
      mediaSession.setState("music", "playing");
      engine?.resume();
      startTicker();
    },

    next: () => {
      const q = get().queue;
      const index = q?.order[q.at];
      if (!q || index === undefined) return;
      const to = followingIndex(q, index, false);
      if (to === null) {
        // Past the end with repeat off: stop at the top of the queue.
        engine?.close();
        const first = q.order[0];
        const queue = first === undefined ? q : moveTo(q, first);
        set({ queue, track: currentItem(queue), status: "paused", loading: false, position: 0 });
        stopTicker();
        mediaSession.setState("music", "paused");
        return;
      }
      startAt(to, 0);
    },

    prev: () => {
      const { queue: q, position } = get();
      const index = q?.order[q.at];
      if (!q || index === undefined) return;
      startAt(position > PREV_RESTART_S ? index : precedingIndex(q, index), 0);
    },

    seek: (seconds) => {
      const { queue: q, status, duration } = get();
      const index = q?.order[q.at];
      if (!q || index === undefined) return;
      const to = Math.max(0, Math.min(seconds, duration ?? seconds));
      if (status === "playing") startAt(index, to);
      else {
        // Paused: the new place shows now and plays from there on resume.
        engine?.close();
        set({ position: to });
      }
    },

    seekBy: (seconds) => {
      get().seek(get().position + seconds);
    },

    stop: () => {
      engine?.close();
      stopTicker();
      set({ queue: null, track: null, status: "idle", loading: false, position: 0, duration: null });
      mediaSession.release("music");
    },

    setShuffle: (on) => {
      const q = get().queue;
      set({ shuffle: on, ...(q ? { queue: setShuffle(q, on) } : {}) });
      engine?.replanNext();
    },

    cycleRepeat: () => {
      const repeat = cycleRepeat(get().repeat);
      const q = get().queue;
      set({ repeat, ...(q ? { queue: { ...q, repeat } } : {}) });
      engine?.replanNext();
    },

    setVolume: (level) => {
      setVolumePref({ level, muted: false });
    },

    nudgeVolume: (by) => {
      setVolumePref(nudgeVolume(volumePref.get(), by));
    },

    toggleMute: () => {
      const v = volumePref.get();
      // Unmuting at 0 would stay silent: back to a level you can hear.
      setVolumePref(v.muted ? { level: v.level > 0 ? v.level : 0.5, muted: false } : { ...v, muted: true });
    },
  };
});
