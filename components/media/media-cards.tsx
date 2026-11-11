"use client";

import * as React from "react";
import { BookmarkCheck, BookmarkPlus, Folder, Music, Pause, Play, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { timeLeft } from "@/lib/media/cinema";
import { displayTitle, episodeOf, type Show } from "@/lib/media/episodes";
import type { Track } from "@/lib/media/library";
import { formatDuration } from "@/lib/media/media";
import { resumeAt } from "@/lib/media/resume";
import type { PlayGroup } from "@/lib/media/stats";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { useMusicPlayer } from "./music-player";
import { Equalizer, clock } from "./now-playing-card";
import { SHELF_CARD } from "./shelf";
import { preloadSurface } from "./stage";
import { Thumb } from "./thumb";
import { openWatch } from "./watch-nav";

// Media Home's cards (T73): videos and shows as 16:9 pictures, albums and
// folder mixes as island-skinned squares, songs as covers. A card is one
// button (the shelf's arrow keys move between them); a card in the Videos
// grid has its Watch later and Remove beside that button, never inside it.

const CARD = "group/card flex w-full flex-col gap-2 rounded-[16px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-sheet";
/** The slight lift on hover (CSS, so reduced motion's backstop makes it instant). */
const LIFT = "transition-transform duration-200 ease-out-quint group-hover/card:scale-[1.03] group-focus-visible/card:scale-[1.03]";

function PlayGlyph({ paused = false, className }: { paused?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-11 place-items-center rounded-full bg-island/70 text-island-foreground shadow-lift", className)}>
      {paused ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
    </span>
  );
}

/** Where an item was left, as a share of it: only where opening it picks up there (V55). */
function shareOf(item: MediaItem): number {
  const p = item.progress;
  if (!p || p.watched || !item.durationS || resumeAt(p, item.durationS) <= 0) return 0;
  return Math.min(1, p.positionS / item.durationS);
}

function ProgressLine({ share }: { share: number }) {
  if (share <= 0) return null;
  return (
    <span aria-hidden className="absolute inset-x-2.5 bottom-2.5 h-1 overflow-hidden rounded-pill bg-island/50">
      <span className="block h-full rounded-pill bg-signal" style={{ width: `${String(Math.round(share * 100))}%` }} />
    </span>
  );
}

function videoMeta(item: MediaItem, share: number): string {
  if (share > 0 && item.durationS && item.progress) return timeLeft(item.progress.positionS, item.durationS);
  if (item.progress?.watched) return "Watched";
  return formatDuration(item.durationS);
}

/** A video: its picture, where it was left, and its name. A click opens it in the Watch view. */
export function VideoCard({
  item,
  onWatchLater,
  onRemove,
}: {
  item: MediaItem;
  /** The Videos grid's own actions; Home's cards have none. */
  onWatchLater?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
}) {
  const named = displayTitle(item);
  const ep = episodeOf(item);
  const share = shareOf(item);
  const meta = videoMeta(item, share);
  const queued = item.watchLaterAt !== null;
  return (
    <div className="group/item relative">
      <button
        type="button"
        {...{ [SHELF_CARD]: "" }}
        onPointerEnter={preloadSurface}
        onClick={() => {
          openWatch(item.id);
        }}
        aria-label={`Play ${named.show ? `${named.show}, ${named.title}` : named.title}${meta ? `, ${meta}` : ""}`}
        className={CARD}
      >
        <span className="block overflow-hidden rounded-[14px]">
          <Thumb item={item} className={cn("w-full", LIFT)}>
            <span aria-hidden className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
              <PlayGlyph />
            </span>
            <ProgressLine share={share} />
          </Thumb>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span className="truncate text-sm font-medium text-foreground">{named.show ?? named.title}</span>
          <span className="truncate text-xs text-ink-2">
            {ep ? `S${String(ep.season)} · E${String(ep.episode)} · ${named.title}` : null}
            {ep && meta ? " · " : null}
            {meta ? <span className="tabular">{meta}</span> : null}
          </span>
        </span>
      </button>
      {onWatchLater || onRemove ? (
        <span className="absolute top-2 right-2 flex items-center gap-1">
          {onWatchLater ? (
            <button
              type="button"
              onClick={onWatchLater}
              aria-label={queued ? `Remove ${item.title} from Watch later` : `Watch ${item.title} later`}
              aria-pressed={queued}
              className={buttonClass(
                "ghost",
                "circle-sm",
                cn("bg-island/60 text-island-foreground hover:bg-island/80", queued ? "text-signal" : "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"),
              )}
            >
              {queued ? <BookmarkCheck aria-hidden className="size-4" /> : <BookmarkPlus aria-hidden className="size-4" />}
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${item.title}`}
              className={buttonClass("ghost", "circle-sm", "bg-island/60 text-island-foreground opacity-0 group-hover/item:opacity-100 hover:bg-island/80 focus-visible:opacity-100")}
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/** A folder of videos: its first video's picture on a stack, its name and how many it holds. A click opens the folder. */
export function FolderCard({ label, items, onOpen }: { label: string; items: readonly MediaItem[]; onOpen: () => void }) {
  const cover = items[0];
  if (!cover) return null;
  const count = `${String(items.length)} ${items.length === 1 ? "video" : "videos"}`;
  return (
    <button type="button" {...{ [SHELF_CARD]: "" }} onClick={onOpen} aria-label={`Open the folder ${label}, ${count}`} className={CARD}>
      <span className="relative block pt-2.5">
        {/* Two sheets behind the picture: a stack, in the surface's own tint (no borders). */}
        <span aria-hidden className="absolute inset-x-7 top-0 h-4 rounded-t-[10px] bg-foreground/5 dark:bg-card" />
        <span aria-hidden className="absolute inset-x-3.5 top-1.5 h-4 rounded-t-[12px] bg-foreground/10 dark:bg-card-nested" />
        <span className="relative block overflow-hidden rounded-[14px]">
          <Thumb item={cover} className={cn("w-full", LIFT)}>
            <span aria-hidden className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-pill bg-island/70 px-2.5 py-1 text-xs text-island-foreground">
              <Folder className="size-3.5" />
              <span className="tabular">{items.length}</span>
            </span>
          </Thumb>
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        <span className="tabular truncate text-xs text-ink-2">{count}</span>
      </span>
    </button>
  );
}

/** A show: the episode a click opens, and how far through the show the owner is. */
export function ShowCard({ show }: { show: Show }) {
  const ep = episodeOf(show.next);
  const named = displayTitle(show.next);
  const total = show.episodes.length;
  const share = shareOf(show.next);
  const next = ep ? `S${String(ep.season)} · E${String(ep.episode)}` : named.title;
  return (
    <button
      type="button"
      {...{ [SHELF_CARD]: "" }}
      onPointerEnter={preloadSurface}
      onClick={() => {
        openWatch(show.next.id);
      }}
      aria-label={`${show.show}: play ${next}, ${named.title}`}
      className={CARD}
    >
      <span className="block overflow-hidden rounded-[14px]">
        <Thumb item={show.next} className={cn("w-full", LIFT)}>
          <span aria-hidden className="absolute inset-0 bg-linear-to-t from-island/80 via-island/10 to-transparent" />
          <span className="tabular absolute bottom-2.5 left-3 text-[12px] font-medium text-island-foreground">{share > 0 ? `Continue ${next}` : show.watched > 0 ? `Next: ${next}` : `Start ${next}`}</span>
          <span aria-hidden className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-visible/card:opacity-100">
            <PlayGlyph />
          </span>
        </Thumb>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className="truncate text-sm font-medium text-foreground">{show.show}</span>
        <span className="tabular truncate text-xs text-ink-2">
          {total} episodes{show.watched > 0 ? ` · ${String(show.watched)} watched` : ""}
        </span>
      </span>
    </button>
  );
}

/** "1h 2m", "48m": a group's length. */
export function hoursMinutes(s: number): string {
  const m = Math.round(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${String(h)}h ${String(m % 60)}m` : `${String(m)}m`;
}

/** Whether the player holds one of these tracks: null when not, else whether it's playing. */
function useHolds(paths: ReadonlySet<string>): "playing" | "paused" | null {
  return useMusicPlayer((s) => (s.status !== "idle" && s.track && paths.has(s.track.path) ? s.status : null));
}

/** Plays a group from its top, or pauses and resumes it when it's the one playing. */
function playGroup(tracks: readonly Track[], holds: "playing" | "paused" | null) {
  const player = useMusicPlayer.getState();
  if (holds) player.toggle();
  else player.playList(tracks, 0);
}

function NowChip({ playing }: { playing: boolean }) {
  return (
    <span className="absolute top-2.5 right-2.5 grid h-6 place-items-center rounded-pill bg-island/70 px-2 text-island-foreground">
      <Equalizer playing={playing} />
    </span>
  );
}

/** A recently played album: its cover full-bleed, as a most-played song's. A click plays it. */
export function AlbumCard({ group }: { group: PlayGroup }) {
  const paths = React.useMemo(() => new Set(group.tracks.map((t) => t.path)), [group.tracks]);
  const holds = useHolds(paths);
  return (
    <button
      type="button"
      {...{ [SHELF_CARD]: "" }}
      onClick={() => {
        playGroup(group.tracks, holds);
      }}
      aria-current={holds ? "true" : undefined}
      aria-label={`${holds === "playing" ? "Pause" : "Play"} ${group.label} by ${group.sub}`}
      className={CARD}
    >
      <span className="relative isolate block overflow-hidden rounded-[14px]">
        <Cover coverKey={group.covers[0] ?? null} className={cn("aspect-square w-full", LIFT)} />
        {holds ? <span aria-hidden className="absolute inset-0 bg-island/40" /> : null}
        {holds ? <NowChip playing={holds === "playing"} /> : null}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 grid place-items-center transition-opacity duration-150",
            holds ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-visible/card:opacity-100",
          )}
        >
          <PlayGlyph paused={holds === "playing"} />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className={cn("truncate text-sm font-medium", holds ? "text-signal-ink dark:text-signal" : "text-foreground")}>{group.label}</span>
        <span className="truncate text-xs text-ink-2">Album · {group.sub}</span>
      </span>
    </button>
  );
}

/** A folder of untagged songs played lately: a mosaic of up to four covers. A click plays the folder. */
export function FolderMixCard({ group }: { group: PlayGroup }) {
  const paths = React.useMemo(() => new Set(group.tracks.map((t) => t.path)), [group.tracks]);
  const holds = useHolds(paths);
  const tiles = [0, 1, 2, 3].map((i) => group.covers[i] ?? null);
  const n = group.tracks.length;
  return (
    <button
      type="button"
      {...{ [SHELF_CARD]: "" }}
      onClick={() => {
        playGroup(group.tracks, holds);
      }}
      aria-current={holds ? "true" : undefined}
      aria-label={`${holds === "playing" ? "Pause" : "Play"} the ${group.label} folder, ${String(n)} songs`}
      className={CARD}
    >
      <span className="relative isolate block aspect-square overflow-hidden rounded-[14px] bg-island">
        <span className={cn("grid size-full grid-cols-2 grid-rows-2 gap-0.5", LIFT)}>
          {tiles.map((key, i) =>
            key ? (
              <Cover key={i} coverKey={key} className="size-full" />
            ) : (
              <span key={i} aria-hidden className="grid size-full place-items-center bg-signal-soft text-signal-ink dark:bg-signal/15 dark:text-signal">
                <Music className="size-1/3" />
              </span>
            ),
          )}
        </span>
        {holds ? <span aria-hidden className="absolute inset-0 bg-island/40" /> : null}
        {holds ? <NowChip playing={holds === "playing"} /> : null}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 grid place-items-center transition-opacity duration-150",
            holds ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-visible/card:opacity-100",
          )}
        >
          <PlayGlyph paused={holds === "playing"} />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className={cn("truncate text-sm font-medium", holds ? "text-signal-ink dark:text-signal" : "text-foreground")}>{group.label}</span>
        <span className="tabular truncate text-xs text-ink-2">
          {n} {n === 1 ? "song" : "songs"}
          {group.durationS > 0 ? ` · ${hoursMinutes(group.durationS)}` : ""}
        </span>
      </span>
    </button>
  );
}

/** A most-played song. A click plays the list from it; on the one playing, it pauses and resumes. */
export function SongCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const state = useMusicPlayer((s) => (s.status !== "idle" && s.track?.path === track.path ? s.status : null));
  const duration = track.durationS ? clock(track.durationS) : null;
  return (
    <button
      type="button"
      {...{ [SHELF_CARD]: "" }}
      onClick={() => {
        if (state) useMusicPlayer.getState().toggle();
        else onPlay();
      }}
      aria-current={state ? "true" : undefined}
      aria-label={`${state === "playing" ? "Pause" : "Play"} ${track.title} by ${track.artist}`}
      className={CARD}
    >
      <span className="relative isolate block overflow-hidden rounded-[14px]">
        <Cover coverKey={track.coverKey} className={cn("aspect-square w-full", LIFT)} />
        {state ? <span aria-hidden className="absolute inset-0 bg-island/40" /> : null}
        {state ? <NowChip playing={state === "playing"} /> : null}
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 grid place-items-center transition-opacity duration-150",
            state ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 group-focus-visible/card:opacity-100",
          )}
        >
          <PlayGlyph paused={state === "playing"} />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <span className={cn("truncate text-sm font-medium", state ? "text-signal-ink dark:text-signal" : "text-foreground")}>{track.title}</span>
        <span className="truncate text-xs text-ink-2">
          {track.artist}
          {duration ? (
            <>
              {" · "}
              <span className="tabular">{duration}</span>
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}
