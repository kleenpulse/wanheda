"use client";

import * as React from "react";
import Link from "next/link";
import { BookmarkCheck, BookmarkPlus, Clapperboard, Play, RotateCcw, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { displayTitle } from "@/lib/media/episodes";
import { formatDuration, stepItem } from "@/lib/media/media";
import { continueList, watchLaterList } from "@/lib/media/playback";
import { resumeAt } from "@/lib/media/resume";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { AddBar } from "./add-bar";
import { usePlayer } from "./player-store";
import { Stage, preloadSurface } from "./stage";
import { Thumb } from "./thumb";
import { providerName, useMedia, useMediaApi } from "./use-media";
import { CinemaFrame } from "./video-chrome";
import { openWatch } from "./watch-nav";
import { useHoldRail } from "@/components/shell/rail-lock";

// The Watch view (T61, T72, T73): one player, the library beside it (or below
// it in theatre mode). `?m=` is the item playing, so a reload or a link
// reopens it; it opens from any tab, and the tab stays in the URL for Back.
// Adding a file never uploads it (V54).

export function sourceLabel(item: MediaItem): string {
  if (item.source === "local") return "This device";
  if (item.source === "embed") return providerName(item.meta.provider ?? "");
  return "Link";
}

function Row({
  item,
  active,
  follow,
  onRemove,
  onWatchLater,
}: {
  item: MediaItem;
  active: boolean;
  /** Bring the row into the list's view when it becomes the one playing (the media keys move it). */
  follow: boolean;
  onRemove: () => void;
  onWatchLater: () => void;
}) {
  const ref = React.useRef<HTMLLIElement>(null);
  React.useEffect(() => {
    if (active && follow && ref.current) followRow(ref.current);
  }, [active, follow]);
  const duration = formatDuration(item.durationS);
  const watched = item.progress?.watched ?? false;
  // A bar only where opening it picks up there (resumeAt), so the row never promises a place the player skips.
  const share = item.progress && item.durationS && resumeAt(item.progress, item.durationS) > 0 ? Math.min(1, item.progress.positionS / item.durationS) : 0;
  const queued = item.watchLaterAt !== null;
  const named = displayTitle(item);
  return (
    <li ref={ref} className="group relative">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onPointerEnter={preloadSurface}
        onClick={() => {
          openWatch(item.id);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-[14px] py-2 pr-20 pl-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-signal-soft text-foreground dark:bg-signal/15" : "hover:bg-foreground/5 dark:hover:bg-card-nested",
        )}
      >
        {/* The picture, with where it was left along its foot (T72). */}
        <Thumb item={item} className="w-24 shrink-0 rounded-[10px]">
          {active ? (
            <span aria-hidden className="absolute inset-0 grid place-items-center bg-island/45 text-island-foreground">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          ) : null}
          {share > 0 && !watched ? (
            <span aria-hidden className="absolute inset-x-1.5 bottom-1.5 h-0.75 overflow-hidden rounded-pill bg-island/50">
              <span className="block h-full rounded-pill bg-signal" style={{ width: `${String(Math.round(share * 100))}%` }} />
            </span>
          ) : null}
        </Thumb>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{named.title}</span>
          <span className="truncate text-xs text-ink-2">
            {named.show && named.line ? `${named.show} · ${named.line.replace("Season ", "S").replace(" · Episode ", " E")} · ` : `${sourceLabel(item)} · `}
            {watched ? "Watched · " : null}
            {duration ? <span className="tabular">{duration}</span> : null}
          </span>
        </span>
      </button>
      <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
        <button
          type="button"
          onClick={onWatchLater}
          aria-label={queued ? `Remove ${item.title} from Watch later` : `Watch ${item.title} later`}
          aria-pressed={queued}
          className={buttonClass(
            "ghost",
            "circle-sm",
            queued ? "text-signal-ink" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          {queued ? <BookmarkCheck aria-hidden className="size-4" /> : <BookmarkPlus aria-hidden className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.title}`}
          className={buttonClass("ghost", "circle-sm", "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </span>
    </li>
  );
}

/**
 * Scrolls the library list (only the list: stacked, the view scrolls too, and the player must stay put)
 * just enough to show the row, clear of the dock clearance at its foot. FOLLOW_ROOM covers the
 * progress bar the row grows once it plays, after this has measured it.
 */
const FOLLOW_ROOM = 16;
function followRow(row: HTMLElement) {
  const list = row.closest<HTMLElement>("[data-video-list]");
  if (!list) return;
  // A row clicked earlier keeps focus, and a key press then shows its ring: move focus (and the ring) to the playing row.
  const focused = document.activeElement;
  const own = row.querySelector("button");
  if (own && focused instanceof HTMLElement && focused !== own && list.contains(focused) && focused.closest("li")) own.focus({ preventScroll: true });
  if (getComputedStyle(list).overflowY === "visible") return;
  const r = row.getBoundingClientRect();
  const l = list.getBoundingClientRect();
  const foot = l.bottom - parseFloat(getComputedStyle(list).paddingBottom);
  if (r.top < l.top) list.scrollBy({ top: r.top - l.top - FOLLOW_ROOM });
  else if (r.bottom + FOLLOW_ROOM > foot) list.scrollBy({ top: r.bottom + FOLLOW_ROOM - foot });
}

function ListSkeleton() {
  return (
    <ul aria-busy aria-label="Loading library" className="flex flex-col gap-1">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ opacity: 1 - i * 0.2 }}>
          <span className="size-8 rounded-full bg-foreground/6 dark:bg-card-nested" />
          <span className="h-3.5 w-3/5 rounded-pill bg-foreground/6 dark:bg-card-nested" />
        </li>
      ))}
    </ul>
  );
}

// The pb is page-frame.tsx's FLOATING_BAR_CLEARANCE, moved into whatever scrolls (written out: Tailwind reads it from source).
/** The videos view filling the page (stacked below lg, so it scrolls itself there; focus rings get 4px of room). */
const FILL_VIEW =
  "-mx-1 -mt-1 min-h-0 flex-1 px-1 pt-1 max-lg:content-start max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:scroll-fade max-lg:pb-[calc(76px+2rem)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)]";
/** Side by side, the list takes the column's height to the sheet's bottom edge, as Music's does (music-view.tsx LIST_FILL). */
/**
 * A wide but short window: the 16:9 stage is narrowed so it, the title and the bar sit above the dock.
 * 25rem = the header and tabs above the stage, the title and bar below it, and the dock clearance;
 * 24rem is a floor for the frame's own minimum height.
 */
const FILL_STAGE = "lg:max-w-[max(24rem,calc((var(--app-h)-25rem)*16/9))]";
/** If it still doesn't fit (a very short window), the column scrolls rather than run under the dock. */
const FILL_PLAYER = "lg:-mx-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-[calc(76px+2rem)]";
const FILL_LIST = "lg:min-h-40 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:scroll-fade lg:pb-[calc(76px+2rem)]";

const isSubtitleFile = (f: File) => /\.(srt|vtt)$/i.test(f.name);

const chip = (on: boolean) =>
  buttonClass("ghost", "pill-sm", on ? "bg-signal-soft text-signal-ink dark:bg-signal/15" : "bg-foreground/6 text-foreground dark:bg-card-nested");

/** Watch later, under the stage (subtitles and theatre live in the player's own controls, T72). */
function WatchLaterChip({ item }: { item: MediaItem }) {
  const api = useMediaApi();
  const queued = item.watchLaterAt !== null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <button
        type="button"
        aria-pressed={queued}
        className={chip(queued)}
        onClick={() => {
          api.setWatchLater(item, !queued);
        }}
      >
        {queued ? <BookmarkCheck aria-hidden /> : <BookmarkPlus aria-hidden />}
        Watch later
      </button>
    </div>
  );
}

/** Resume mode "ask" (Settings → Sound): the video waits, paused on its saved place. Play in the player works as Resume too. */
function ResumePrompt({ itemId }: { itemId: string }) {
  const ask = usePlayer((s) => (s.ask?.itemId === itemId ? s.ask : null));
  if (!ask) return null;
  // Floored, as the player's own clock shows it (formatDuration rounds).
  const at = formatDuration(Math.floor(ask.at));
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <div
        role="group"
        aria-label="Saved place"
        className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-card glass-window px-5 py-4 text-center text-foreground shadow-lg"
      >
        <p className="text-sm text-ink-2">
          You stopped at <span className="tabular font-medium text-foreground">{at}</span>.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className={buttonClass("inverse", "pill-sm")}
            onClick={() => {
              ask.answer("resume");
            }}
          >
            <Play aria-hidden />
            Resume from <span className="tabular">{at}</span>
          </button>
          <button
            type="button"
            className={buttonClass("ghost", "pill-sm", "bg-foreground/6 text-foreground dark:bg-card-nested")}
            onClick={() => {
              ask.answer("start");
            }}
          >
            <RotateCcw aria-hidden />
            Start over
          </button>
        </div>
        <Link href="/settings?s=sound" className="text-xs text-ink-3 underline-offset-2 hover:text-foreground hover:underline">
          Always resume or start over? Settings → Sound
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-3 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function WatchView() {
  const { data, failed, refetch } = useMedia();
  const api = useMediaApi();
  const selected = useUrlParam("m");
  const items = data?.items ?? null;
  const current = items?.find((i) => i.id === selected) ?? null;
  const currentName = current ? displayTitle(current) : null;
  const [dragging, setDragging] = React.useState(false);
  const theatre = usePlayer((s) => s.theatre);
  // Theatre wants the width: the rail stays collapsed until it is left.
  useHoldRail(theatre && current ? "Leave theatre mode to expand it again." : null);
  const going = items ? continueList(items) : [];
  const later = items ? watchLaterList(items) : [];

  const open = (item: MediaItem) => {
    openWatch(item.id);
  };

  // The prev|next media keys walk the All list from the item that's open.
  const currentId = current?.id ?? null;
  React.useEffect(() => {
    if (!items || !currentId) return;
    usePlayer.getState().setStep((dir) => {
      const to = stepItem(items, currentId, dir);
      if (to) openWatch(to.id);
      return to !== null;
    });
    return () => {
      usePlayer.getState().setStep(null);
    };
  }, [items, currentId]);

  const row = (item: MediaItem, follow = false) => (
    <Row
      key={item.id}
      item={item}
      active={item.id === current?.id}
      follow={follow}
      onWatchLater={() => {
        api.setWatchLater(item, item.watchLaterAt === null);
      }}
      onRemove={() => {
        api.remove(item, () => {
          if (new URLSearchParams(window.location.search).get("m") === item.id) replaceUrlParams({ m: null });
        });
      }}
    />
  );

  return (
    <div
      // Out of theatre the view fills the page as Music does (page-frame.tsx): the page never
      // scrolls. Side by side, only the library list scrolls; stacked, the view scrolls as one.
      data-page-fill={theatre ? undefined : ""}
      className={cn("grid gap-6", !theatre && FILL_VIEW)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        setDragging(false);
        // A subtitle file joins the playing video (V57); anything else joins the library.
        if (isSubtitleFile(file)) {
          void usePlayer
            .getState()
            .subtitles(file)
            .then((ok) => {
              if (!ok) toast({ title: "Nothing is playing", body: "Play a video, then drop its subtitles on it." });
            });
          return;
        }
        void api.addFile(file, null).then((item) => {
          if (item) open(item);
        });
      }}
    >
      <section
        aria-label="Player"
        className={cn("flex min-w-0 flex-col gap-3 rounded-card transition-shadow", !theatre && FILL_PLAYER, dragging && "ring-2 ring-signal")}
      >
        {current ? (
          <>
            {/* The player's frame (V65): it goes full screen with the stage, the resume question and the chrome in it. */}
            <CinemaFrame item={current} items={items ?? []} className={cn(!theatre && FILL_STAGE)}>
              <Stage item={current} />
              <ResumePrompt itemId={current.id} />
            </CinemaFrame>
            <div className="flex min-w-0 flex-col gap-0.5 px-1">
              <h2 className="truncate font-display text-xl leading-tight tracking-[-0.01em] text-foreground">{currentName?.show ? `${currentName.show}: ${currentName.title}` : currentName?.title}</h2>
              <p className="truncate text-xs text-ink-2">
                {currentName?.line ? `${currentName.line} · ` : ""}
                {sourceLabel(current)}
                {current.source === "local" ? ` · ${current.uri}` : ""}
              </p>
            </div>
            <WatchLaterChip item={current} />
          </>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-card bg-foreground/5 px-6 text-center dark:bg-card-nested">
            <Clapperboard aria-hidden className="size-6 text-ink-3" />
            {items === null ? (
              <p className="text-sm text-ink-2">Opening…</p>
            ) : (
              <>
                <p className="text-sm text-ink-2">This video isn&apos;t in your library any more.</p>
                <button
                  type="button"
                  className={buttonClass("ghost", "pill-sm", "bg-foreground/6 text-foreground dark:bg-card-nested")}
                  onClick={() => {
                    replaceUrlParams({ m: null });
                  }}
                >
                  Back
                </button>
              </>
            )}
          </div>
        )}
      </section>

      <aside aria-label="Library" className={cn("flex min-w-0 flex-col gap-4", !theatre && "lg:min-h-0")}>
        <AddBar onAdded={open} />
        {failed ? (
          <p className="flex items-center gap-2 px-1 text-[13px] text-ink-2">
            Couldn&apos;t load the library.
            <button type="button" className="font-medium text-signal-ink underline-offset-2 hover:underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        ) : items === null ? (
          <ListSkeleton />
        ) : items.length === 0 ? null : (
          <div data-video-list className={cn("-mx-1 flex flex-col gap-4 px-1 py-1", theatre ? "max-h-[min(70vh,44rem)] overflow-y-auto scroll-fade overscroll-contain" : FILL_LIST)}>
            {going.length > 0 ? (
              <Section title="Continue">
                <ul className="flex flex-col gap-1">{going.map((i) => row(i))}</ul>
              </Section>
            ) : null}
            {later.length > 0 ? (
              <Section title="Watch later">
                <ul className="flex flex-col gap-1">{later.map((i) => row(i))}</ul>
              </Section>
            ) : null}
            <Section title="All">
              <ul className="flex flex-col gap-1">{items.map((i) => row(i, true))}</ul>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}
