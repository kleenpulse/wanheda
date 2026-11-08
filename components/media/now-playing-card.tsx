"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { LoaderCircle, Music, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { glowPref, showsGlow } from "@/lib/media/glow";
import { BARS, REST, autoGain, bandEdges, bandLevels, easeBar, newGain } from "@/lib/media/levels";
import { volumePref } from "@/lib/media/volume";
import { cn } from "@/lib/utils";
import { useCoverUrl } from "./cover";
import { useMusicLibrary } from "./music-library";
import { musicLevels, musicPosition, useMusicPlayer } from "./music-player";
import { WHEEL_SEEK_S, useWheelSteps } from "@/hooks/use-wheel-steps";
import { SoundGlow } from "./sound-glow";
import { VolumeRocker, type VolumeTarget } from "./volume-rocker";

// The now-playing card, ported from Motion Garden's LiveActivity media card
// (shadow-garden components/registry/live-activity/activities.tsx: MediaCard,
// WaveProgress, Equalizer): the album art dimmed behind, where the sound comes
// from and the Output chip, title and artist, a wave that slides along the
// played part, and the transport. Driven by the music player store, so the
// island, the player window and Home's widget show one card.
//
// Changes from the registry: colours are the island's tokens (black in both
// skins); the wave is a mask over a token fill instead of a white data URL;
// the bar seeks (an invisible range on top, arrow keys included); the
// equalizer follows the music's real sound (an AnalyserNode), not a loop; a
// volume rocker sits where the registry has its Output chip (user 2026-11-07).

// One period of a sine, tiled along the played part of the bar. Sliding the
// tile is the whole animation: no path is ever rebuilt.
const WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='14'%3E%3Cpath d='M0 7 Q20 1 40 7 T80 7' fill='none' stroke='black' stroke-width='3'/%3E%3C/svg%3E")`;

/** mm:ss (h:mm:ss past an hour), as the registry's padded clock. */
export function clock(s: number | null): string {
  const v = Math.max(0, Math.floor(s ?? 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = String(v % 60).padStart(2, "0");
  return h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
}

export function RoundButton({ label, onClick, disabled = false, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-island-foreground/12 text-island-foreground transition-[background-color,transform] duration-150 hover:bg-island-foreground/20 active:scale-90 disabled:pointer-events-none disabled:opacity-40",
        "outline-none focus-visible:ring-2 focus-visible:ring-island-foreground/70",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Still heights for reduced motion: reads as an equalizer, never as four dots. */
const STILL = [0.55, 0.9, 0.45, 0.7] as const;

/**
 * Four bars that follow the music: the analyser's spectrum in four bands,
 * painted straight onto the bars each frame (no React render per frame). They
 * settle to rest on a pause; with reduced motion they hold still.
 */
export function Equalizer({ playing }: { playing: boolean }) {
  const reduced = Boolean(useReducedMotion());
  const bars = React.useRef<(HTMLSpanElement | null)[]>([]);
  const heights = React.useRef<number[]>(Array.from({ length: BARS }, () => REST));

  React.useEffect(() => {
    const paint = (hs: readonly number[]) => {
      bars.current.forEach((el, i) => {
        if (el) el.style.transform = `scaleY(${String(hs[i] ?? REST)})`;
      });
    };
    if (reduced) {
      paint(playing ? STILL : heights.current.map(() => REST));
      return;
    }
    const data = new Uint8Array(32);
    const edges = bandEdges(data.length);
    const gain = newGain();
    let raf = 0;
    const loop = () => {
      const heard = playing && musicLevels(data);
      const levels = heard ? autoGain(gain, bandLevels(data, edges)) : [];
      heights.current = heights.current.map((h, i) => easeBar(h, levels[i] ?? 0));
      paint(heights.current);
      // Paused and settled: stop asking for frames.
      if (!playing && heights.current.every((h) => h - REST < 0.002)) return;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, reduced]);

  return (
    <span aria-hidden className="flex h-4 items-center gap-[3px]">
      {STILL.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className="h-full w-[3px] origin-center rounded-full bg-island-foreground/85"
          style={{ transform: `scaleY(${String(REST)})` }}
        />
      ))}
    </span>
  );
}

const MUSIC_VOLUME: VolumeTarget = {
  pref: volumePref,
  what: "music",
  set: (level) => {
    useMusicPlayer.getState().setVolume(level);
  },
  nudge: (by) => {
    useMusicPlayer.getState().nudgeVolume(by);
  },
  toggleMute: () => {
    useMusicPlayer.getState().toggleMute();
  },
};

/** The music's volume rocker (kept on this device). */
export function MusicVolume() {
  return <VolumeRocker target={MUSIC_VOLUME} />;
}

/** The wave progress bar, seekable: drag or arrow keys, the seek lands on release. */
export function WaveScrub() {
  // The wheel over the bar seeks, a notch at a time (every slider takes the wheel).
  const scrub = React.useRef<HTMLDivElement>(null);
  useWheelSteps(scrub, (steps) => {
    useMusicPlayer.getState().seekBy(steps * WHEEL_SEEK_S);
  });
  const position = useMusicPlayer((s) => s.position);
  const duration = useMusicPlayer((s) => s.duration);
  const playing = useMusicPlayer((s) => s.status === "playing" && !s.loading);
  const idle = useMusicPlayer((s) => s.status === "idle");
  const reduced = Boolean(useReducedMotion());
  const [drag, setDrag] = React.useState<number | null>(null);
  // Where the pointer is over the bar, 0..1, for the seek tooltip.
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = drag ?? position;
  const total = duration ?? 0;
  const value = total > 0 ? Math.min(1, Math.max(0, shown / total)) : 0;
  const pct = `${String(value * 100)}%`;
  const moving = playing && !reduced && drag === null;
  const max = Math.max(1, Math.floor(total));
  // The tooltip names the second a click would land on (the range rounds to its
  // step): the pointer's spot, or the dragged one (keys included) when no
  // pointer is over the bar.
  const tip = total <= 0 || idle ? null : hover !== null ? { at: hover, time: Math.round(hover * max) } : drag !== null ? { at: value, time: drag } : null;

  // The store ticks 4 times a second; between ticks the head glides on the
  // audio clock, written straight to the bar (no render a frame).
  const rest = React.useRef<HTMLDivElement>(null);
  const fill = React.useRef<HTMLDivElement>(null);
  const head = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!moving || total <= 0) return;
    let raf = 0;
    const loop = () => {
      const s = musicPosition();
      if (s !== null) {
        const at = `${String(Math.min(1, Math.max(0, s / total)) * 100)}%`;
        if (rest.current) rest.current.style.left = at;
        if (fill.current) fill.current.style.width = at;
        if (head.current) head.current.style.left = at;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [moving, total]);
  const commit = () => {
    if (drag !== null) useMusicPlayer.getState().seek(drag);
    setDrag(null);
  };
  const pointAt = (e: React.PointerEvent<HTMLInputElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : null);
  };
  return (
    <div>
      <div ref={scrub} className="group/scrub relative h-3.5 rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-island-foreground/70">
        {tip ? (
          <span
            aria-hidden
            className="tabular pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-full bg-island-foreground px-1.5 py-0.5 text-[11px] leading-none font-medium text-island"
            style={{ left: `clamp(1.25rem, ${String(tip.at * 100)}%, calc(100% - 1.25rem))` }}
          >
            {clock(tip.time)}
          </span>
        ) : null}
        <div ref={rest} className="absolute top-1/2 right-0 h-[3px] -translate-y-1/2 rounded-full bg-island-foreground/25" style={{ left: pct }} />
        <motion.div
          ref={fill}
          aria-hidden
          className="absolute inset-y-0 left-0 bg-island-foreground"
          style={{ width: pct, maskImage: WAVE, maskRepeat: "repeat-x", maskSize: "80px 14px" }}
          animate={{ maskPosition: moving ? ["0px 50%", "80px 50%"] : "0px 50%" }}
          transition={moving ? { duration: 2.4, ease: "linear", repeat: Infinity } : { duration: 0.3 }}
        />
        <div
          ref={head}
          aria-hidden
          // The round head shows only while the bar is in hand: hover, keyboard focus, a drag (touch has no hover).
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-island-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-island)_25%,transparent)] transition-[opacity,scale] duration-150",
            drag !== null ? "scale-100 opacity-100" : "scale-50 opacity-0 group-hover/scrub:scale-100 group-hover/scrub:opacity-100 group-has-focus-visible/scrub:scale-100 group-has-focus-visible/scrub:opacity-100",
          )}
          style={{ left: pct }}
        />
        <input
          type="range"
          aria-label="Seek"
          aria-valuetext={`${clock(shown)} of ${clock(total)}`}
          min={0}
          max={max}
          step={1}
          value={Math.floor(shown)}
          disabled={idle || total <= 0}
          onChange={(e) => {
            setDrag(Number(e.currentTarget.value));
          }}
          onPointerMove={pointAt}
          onPointerLeave={() => {
            setHover(null);
          }}
          onPointerUp={commit}
          onPointerCancel={commit}
          // Keys move the seek: the tip follows them, not a resting pointer.
          onKeyDown={() => {
            setHover(null);
          }}
          onKeyUp={commit}
          onBlur={commit}
          // A 0-wide native thumb maps a click straight to its x, so the seek
          // lands where the tooltip and the drawn dot say.
          className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default [&::-moz-range-thumb]:size-0 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:size-0 [&::-webkit-slider-thumb]:appearance-none"
        />
      </div>
      <div className="tabular mt-1.5 flex justify-between text-[11px] text-island-foreground/50">
        <span>{clock(shown)}</span>
        <span>{clock(total)}</span>
      </div>
    </div>
  );
}

/** Where the sound comes from: the music folder, or the demo's tones. */
function useSource(): string {
  return useMusicLibrary((s) => (s.folder.kind === "none" ? "Test tones" : s.folder.name));
}

export function NowPlayingCard({ className }: { className?: string }) {
  const track = useMusicPlayer((s) => s.track);
  const status = useMusicPlayer((s) => s.status);
  const loading = useMusicPlayer((s) => s.loading);
  const art = useCoverUrl(track?.coverKey ?? null);
  const source = useSource();
  const glow = glowPref.use();
  const { prev, next, toggle } = useMusicPlayer.getState();
  if (!track) return null;
  const playing = status === "playing";

  return (
    <div className={cn("relative isolate overflow-hidden bg-island p-5 text-island-foreground", className)}>
      {art ? (
        <>
          <img src={art} alt="" draggable={false} className="absolute inset-0 -z-10 size-full object-cover opacity-45" />
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-island/30 via-island/55 to-island/80" />
        </>
      ) : null}
      {/* No art: the music paints the backdrop. Gated here, not inside, so each "on" mounts a fresh glow bound to its box. */}
      {showsGlow(Boolean(art), glow) ? <SoundGlow playing={playing && !loading} /> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium tracking-wide text-island-foreground/70 uppercase">
          <Music aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{source}</span>
        </span>
        <MusicVolume />
      </div>
      <div className="mt-2.5">
        <p className="truncate text-base font-semibold">{track.title}</p>
        <p className="truncate text-sm text-island-foreground/60">{track.artist}</p>
      </div>
      <div className="mt-4">
        <WaveScrub />
      </div>
      <div className="mt-2 flex items-center justify-center gap-4">
        <RoundButton label="Previous track" onClick={prev} className="bg-transparent">
          <SkipBack aria-hidden className="size-5 fill-current" />
        </RoundButton>
        <RoundButton label={playing ? "Pause music" : "Play music"} onClick={toggle} className="size-12 bg-island-foreground text-island hover:bg-island-foreground/90">
          {playing && loading ? (
            <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
          ) : playing ? (
            <Pause aria-hidden className="size-5 fill-current" />
          ) : (
            <Play aria-hidden className="size-5 translate-x-px fill-current" />
          )}
        </RoundButton>
        <RoundButton label="Next track" onClick={next} className="bg-transparent">
          <SkipForward aria-hidden className="size-5 fill-current" />
        </RoundButton>
      </div>
    </div>
  );
}

/** The island pill's leading art: the cover, or a note where there is none. */
export function NowPlayingArt() {
  const coverKey = useMusicPlayer((s) => s.track?.coverKey ?? null);
  const art = useCoverUrl(coverKey);
  return art ? (
    <img src={art} alt="" draggable={false} className="size-6 rounded-md object-cover" />
  ) : (
    <span className="grid size-6 place-items-center rounded-md bg-island-foreground/12">
      <Music aria-hidden className="size-3.5" />
    </span>
  );
}
