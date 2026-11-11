"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ListMusic, LoaderCircle, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { Menu, MenuContent, MenuHeader, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Tip } from "@/components/ui/tooltip";
import { useActivity } from "@/lib/activity/store";
import { formatDuration } from "@/lib/media/media";
import { upNext } from "@/lib/media/queue";
import { BANNER_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useCoverUrl } from "./cover";
import { useMusicPlayer } from "./music-player";
import { Equalizer, MusicVolume, RoundButton, WaveScrub } from "./now-playing-card";

// The now-playing bar (T73, V66): on Media Home and Music, while the player
// holds a song, an island-skinned pill floats just above the dock (above the
// tab bar on phones) with the art, the transport, the wave scrub, shuffle,
// repeat, the queue and the volume. It never shows over the Watch view. While
// it's up the island leaves out its music card, so the same card never shows
// twice; speech, timers and the rest still show there.

const UP_NEXT = 50;

const SMALL =
  "grid size-8 shrink-0 place-items-center rounded-full text-island-foreground/70 outline-none transition-[background-color,color,transform] duration-150 hover:bg-island-foreground/12 hover:text-island-foreground focus-visible:ring-2 focus-visible:ring-island-foreground/70 active:scale-90 data-[popup-open]:bg-island-foreground/12 data-[popup-open]:text-island-foreground [&_svg]:size-4";

const REPEAT_LABELS = { off: "Repeat is off", all: "Repeating the queue", one: "Repeating this track" } as const;

/** A thin line of how far the song is, where the wave scrub doesn't fit. */
function MiniProgress() {
  const position = useMusicPlayer((s) => s.position);
  const duration = useMusicPlayer((s) => s.duration);
  const share = duration && duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 overflow-hidden rounded-full bg-island-foreground/15 @xl:hidden">
      <span className="block h-full bg-island-foreground/80" style={{ width: `${String(share * 100)}%` }} />
    </span>
  );
}

function Queue() {
  const queue = useMusicPlayer((s) => s.queue);
  const next = queue ? upNext(queue, UP_NEXT) : [];
  return (
    <Menu>
      <MenuTrigger aria-label="Up next" title="Up next" className={SMALL}>
        <ListMusic aria-hidden />
      </MenuTrigger>
      <MenuContent side="top" align="end" sideOffset={14} className="max-h-[min(60vh,26rem)] w-76 overflow-y-auto overscroll-contain scroll-fade">
        <MenuHeader>
          <p className="readout">Up next</p>
        </MenuHeader>
        {next.length === 0 ? (
          <p className="px-2.5 pb-2 text-[13px] text-ink-2">Nothing after this song.</p>
        ) : (
          next.map(({ index, item }) => (
            <MenuItem
              key={`${String(index)}:${item.path}`}
              className="h-auto py-1.5"
              onClick={() => {
                useMusicPlayer.getState().jump(index);
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] text-foreground">{item.title}</span>
                <span className="truncate text-[11px] text-ink-2">{item.artist}</span>
              </span>
              {item.durationS ? <span className="tabular shrink-0 text-[11px] text-ink-3">{formatDuration(item.durationS)}</span> : null}
            </MenuItem>
          ))
        )}
      </MenuContent>
    </Menu>
  );
}

export function NowPlayingBar() {
  const track = useMusicPlayer((s) => (s.status === "idle" ? null : s.track));
  const status = useMusicPlayer((s) => s.status);
  const loading = useMusicPlayer((s) => s.loading);
  const shuffle = useMusicPlayer((s) => s.shuffle);
  const repeat = useMusicPlayer((s) => s.repeat);
  const art = useCoverUrl(track?.coverKey ?? null);
  const reduced = Boolean(useReducedMotion());
  const live = track !== null;

  // Holds the music on screen while it's up: the island drops its card meanwhile (V61).
  React.useEffect(() => (live ? useActivity.getState().holdMusic() : undefined), [live]);

  if (!track) return null;
  const { prev, next, toggle, setShuffle, cycleRepeat } = useMusicPlayer.getState();
  const playing = status === "playing";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+0.75rem)] z-30 flex justify-center px-3 md:left-(--rail-w) md:px-8">
      <motion.div
        role="region"
        aria-label="Now playing"
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={BANNER_SPRING}
        className="@container pointer-events-auto relative flex w-full max-w-4xl items-center gap-2.5 rounded-[22px] bg-island p-2 pr-3 text-island-foreground shadow-lift"
      >
        {art ? (
          <img src={art} alt="" draggable={false} className="size-11 shrink-0 rounded-[14px] object-cover" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-island-foreground/12">
            <Music aria-hidden className="size-4.5" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col @xl:w-44 @xl:flex-none">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{track.title}</span>
            <span className="shrink-0">
              <Equalizer playing={playing && !loading} />
            </span>
          </span>
          <span className="truncate text-xs text-island-foreground/60">{track.artist}</span>
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <RoundButton label="Previous track" onClick={prev} className="hidden size-9 bg-transparent @md:grid">
            <SkipBack aria-hidden className="size-4 fill-current" />
          </RoundButton>
          <RoundButton label={playing ? "Pause music" : "Play music"} onClick={toggle} className="bg-island-foreground text-island hover:bg-island-foreground/90">
            {playing && loading ? (
              <LoaderCircle aria-hidden className="size-4.5 animate-spin motion-reduce:animate-none" />
            ) : playing ? (
              <Pause aria-hidden className="size-4.5 fill-current" />
            ) : (
              <Play aria-hidden className="size-4.5 translate-x-px fill-current" />
            )}
          </RoundButton>
          <RoundButton label="Next track" onClick={next} className="size-9 bg-transparent">
            <SkipForward aria-hidden className="size-4 fill-current" />
          </RoundButton>
        </span>

        <div className="hidden min-w-0 flex-1 px-1 pt-1 @xl:block">
          <WaveScrub />
        </div>

        <span className="flex shrink-0 items-center gap-0.5">
          <Tip
            label={shuffle ? "Shuffle is on" : "Shuffle"}
            render={
              <button
                type="button"
                aria-label={shuffle ? "Shuffle is on" : "Shuffle is off"}
                aria-pressed={shuffle}
                onClick={() => {
                  setShuffle(!shuffle);
                }}
                className={cn(SMALL, "hidden @2xl:grid", shuffle && "text-signal hover:text-signal")}
              />
            }
          >
            <Shuffle aria-hidden />
          </Tip>
          <Tip
            label={REPEAT_LABELS[repeat]}
            render={
              <button
                type="button"
                aria-label={REPEAT_LABELS[repeat]}
                aria-pressed={repeat !== "off"}
                onClick={cycleRepeat}
                className={cn(SMALL, "hidden @2xl:grid", repeat !== "off" && "text-signal hover:text-signal")}
              />
            }
          >
            {repeat === "one" ? <Repeat1 aria-hidden /> : <Repeat aria-hidden />}
          </Tip>
          <Queue />
        </span>
        <span className="hidden @3xl:flex">
          {/* No wheel here: the bar floats over a page that scrolls under it. */}
          <MusicVolume />
        </span>
        <MiniProgress />
      </motion.div>
    </div>
  );
}
