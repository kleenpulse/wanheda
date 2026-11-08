"use client";

import * as React from "react";
import { ChevronDown, Play, X } from "lucide-react";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { countdownFrom, timeLeft } from "@/lib/media/cinema";
import { displayTitle, episodeOf, railItems } from "@/lib/media/episodes";
import { formatDuration } from "@/lib/media/media";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { Thumb } from "./thumb";

// The up-next rail and the autoplay card (T72): the screenshot's stack of
// episode cards at the right of the picture, the playing one in front with
// its time left, and the "next in 8 s" card in a video's last seconds.

/** "11. Episode 11" for an episode, the cleaned title otherwise. */
export function cardTitle(item: MediaItem): string {
  const ep = episodeOf(item);
  const { title } = displayTitle(item);
  return ep ? `${String(ep.episode)}. ${title}` : title;
}

function cardMeta(item: MediaItem, liveS: number | null): string {
  const d = item.durationS;
  const at = liveS ?? item.progress?.positionS ?? null;
  if (d && at !== null && at > 0 && !(item.progress?.watched && liveS === null)) return timeLeft(at, d);
  if (item.progress?.watched) return "Watched";
  return formatDuration(d);
}

function RailCard({ item, current, liveS, onPick }: { item: MediaItem; current: boolean; liveS: number | null; onPick: () => void }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    // Centre the playing card in the rail's own scroller (scrollIntoView would move the page too).
    const card = ref.current;
    const list = card?.parentElement;
    if (!current || !card || !list) return;
    list.scrollTop = card.offsetTop - list.offsetTop - (list.clientHeight - card.offsetHeight) / 2;
  }, [current]);
  const d = item.durationS;
  const at = liveS ?? item.progress?.positionS ?? 0;
  const share = d && at > 0 ? Math.min(1, at / d) : 0;
  return (
    <button
      ref={ref}
      type="button"
      aria-current={current ? "true" : undefined}
      aria-label={`${current ? "Playing: " : "Play "}${cardTitle(item)}`}
      onClick={onPick}
      className={cn(
        "group/card relative w-full shrink-0 overflow-hidden rounded-[14px] text-left outline-none transition-[opacity,scale,box-shadow] duration-200 ease-out-quint focus-visible:ring-2 focus-visible:ring-island-foreground/80",
        current ? "scale-100 opacity-100 shadow-lift" : "scale-[0.94] opacity-70 hover:scale-[0.97] hover:opacity-100 focus-visible:opacity-100",
      )}
    >
      <Thumb item={item} className="w-full">
        <span aria-hidden className="absolute inset-0 bg-linear-to-t from-island/90 via-island/30 to-transparent" />
        <span className="absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5 text-island-foreground">
          <span className={cn("truncate font-semibold", current ? "text-[17px]" : "text-[14px]")}>{cardTitle(item)}</span>
          <span className="tabular text-[12px] text-island-foreground/75">{cardMeta(item, liveS)}</span>
          {share > 0 ? (
            <span aria-hidden className="mt-1.5 h-0.75 w-full overflow-hidden rounded-full bg-island-foreground/25">
              <span className="block h-full rounded-full bg-signal" style={{ width: `${String(share * 100)}%` }} />
            </span>
          ) : null}
        </span>
        {!current ? (
          <span aria-hidden className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover/card:opacity-100">
            <span className="grid size-10 place-items-center rounded-full bg-island/60 text-island-foreground backdrop-blur-sm">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </span>
        ) : null}
      </Thumb>
    </button>
  );
}

export function UpNextRail({
  items,
  current,
  liveS,
  container,
  onPick,
  onClose,
  onMenu,
}: {
  items: readonly MediaItem[];
  current: MediaItem;
  /** The playing item's place now (its card's bar and time left follow it). */
  liveS: number;
  container: HTMLElement | null;
  onPick: (item: MediaItem) => void;
  onClose: () => void;
  onMenu: (open: boolean) => void;
}) {
  // Capped for anything outside a series (railItems): a pause never mounts the whole library.
  const order = React.useMemo(() => railItems(items, current), [items, current]);
  const ep = episodeOf(current);
  const seasons = React.useMemo(() => {
    if (!ep) return [];
    return [...new Set(order.map((i) => episodeOf(i)?.season).filter((s): s is number => s !== undefined))].sort((a, b) => a - b);
  }, [order, ep]);
  const [season, setSeason] = React.useState<number | null>(ep?.season ?? null);
  const shown = season === null ? order : order.filter((i) => episodeOf(i)?.season === season);
  const list = React.useRef<HTMLDivElement>(null);

  return (
    <div
      data-rail
      role="region"
      aria-label="Up next"
      className="pointer-events-auto absolute top-16 right-4 bottom-32 z-20 flex w-[min(20rem,36%)] flex-col gap-2 @4xl/cinema:right-8 @4xl/cinema:w-[min(22rem,30%)]"
    >
      <div className="flex items-center gap-2 px-1 text-island-foreground">
        <span className="readout text-island-foreground/70">{ep ? ep.show : "Up next"}</span>
        <span className="flex-1" />
        {seasons.length > 1 ? (
          <Menu onOpenChange={onMenu}>
            <MenuTrigger className="flex h-8 items-center gap-1.5 rounded-full bg-island-foreground/12 px-3 text-[13px] font-medium outline-none hover:bg-island-foreground/20 focus-visible:ring-2 focus-visible:ring-island-foreground/70">
              <span className="tabular">Season {season ?? ep?.season}</span>
              <ChevronDown aria-hidden className="size-4" />
            </MenuTrigger>
            <MenuContent side="bottom" align="end" container={container} className="min-w-40">
              <MenuRadioGroup
                value={String(season)}
                onValueChange={(v: string) => {
                  setSeason(Number(v));
                }}
              >
                {seasons.map((s) => (
                  <MenuRadioItem key={s} value={String(s)}>
                    <span className="tabular">Season {s}</span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        ) : null}
        <button
          type="button"
          aria-label="Close up next"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-full bg-island-foreground/12 outline-none hover:bg-island-foreground/20 focus-visible:ring-2 focus-visible:ring-island-foreground/70"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div
        ref={list}
        className="-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain scroll-fade px-2 py-2 scrollbar-none"
        onKeyDown={(e) => {
          // Up and down move between the cards, as a list does.
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const cards = Array.from(list.current?.querySelectorAll("button") ?? []);
          const at = cards.indexOf(document.activeElement as HTMLButtonElement);
          const to = cards[Math.min(cards.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
          to?.focus();
          e.preventDefault();
        }}
      >
        {shown.map((item) => (
          <RailCard
            key={item.id}
            item={item}
            current={item.id === current.id}
            liveS={item.id === current.id ? liveS : null}
            onPick={() => {
              if (item.id !== current.id) onPick(item);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * "Next: Episode 12 in 6 s" (T72). Counts down to the next video in this one's
 * last seconds; a file that needs its permission granted again waits for the
 * Play click instead (that click is the gesture the browser asks for).
 */
export function NextCard({
  next,
  remainingS,
  ended,
  needsGesture,
  paused,
  onPlay,
  onCancel,
}: {
  next: MediaItem;
  remainingS: number;
  ended: boolean;
  needsGesture: boolean;
  /** The video is paused: the countdown holds too. */
  paused: boolean;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const reduced = useReducedMotion();
  const [left, setLeft] = React.useState(() => countdownFrom(remainingS, ended));
  const play = React.useEffectEvent(onPlay);
  const [total] = React.useState(left);

  React.useEffect(() => {
    if (needsGesture || paused) return;
    const t = setInterval(() => {
      setLeft((s) => s - 1);
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, [needsGesture, paused]);
  React.useEffect(() => {
    if (!needsGesture && left <= 0) play();
  }, [left, needsGesture]);

  const share = total > 0 ? Math.max(0, left) / total : 0;
  return (
    <div
      role="group"
      aria-label="Next up"
      className="pointer-events-auto absolute right-4 bottom-32 z-30 flex w-[min(22rem,calc(100%-2rem))] items-center gap-3 rounded-[18px] bg-island/80 p-2.5 text-island-foreground shadow-lift backdrop-blur-xl @4xl/cinema:right-8"
    >
      <Thumb item={next} className="w-28 shrink-0 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="readout text-island-foreground/60">{needsGesture ? "Up next" : <span className="tabular">Next in {Math.max(0, left)}s</span>}</span>
        <span className="truncate text-[14px] font-semibold">{cardTitle(next)}</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPlay}
            className="relative isolate flex h-8 items-center gap-1.5 overflow-hidden rounded-full bg-island-foreground px-3.5 text-[13px] font-semibold text-island outline-none focus-visible:ring-2 focus-visible:ring-signal active:scale-[0.98]"
          >
            {/* The countdown drains across the button. */}
            {!needsGesture ? (
              <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 -z-10 bg-signal/40", !reduced && "transition-[width] duration-1000 ease-linear")}
                style={{ width: `${String((1 - share) * 100)}%` }}
              />
            ) : null}
            <Play aria-hidden className="size-3.5 fill-current" />
            {needsGesture ? "Play" : "Play now"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-full px-3 text-[13px] font-medium text-island-foreground/80 outline-none hover:bg-island-foreground/12 hover:text-island-foreground focus-visible:ring-2 focus-visible:ring-island-foreground/70"
          >
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}
