"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { displayTitle } from "@/lib/media/episodes";
import { continueList, watchLaterList } from "@/lib/media/playback";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { AddBar } from "./add-bar";
import { VideoCard } from "./media-cards";
import { useMedia, useMediaApi } from "./use-media";
import { openWatch } from "./watch-nav";

// The Videos tab (T73): the library as a card grid, Continue, Watch later and
// All, with a search and the AddBar on top. A card opens the Watch view; a
// file dropped anywhere on the tab joins the library and opens.

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-4 gap-y-6";
/** All shows this many at first: a 2000-item library mounts in pages, not at once. */
const PAGE = 48;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function matches(item: MediaItem, words: readonly string[]): boolean {
  const named = displayTitle(item);
  const hay = fold(`${item.title} ${named.show ?? ""} ${named.title} ${item.uri}`);
  return words.every((w) => hay.includes(w));
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="readout">{title}</h2>
      {children}
    </section>
  );
}

export function VideosGrid() {
  const { data, failed, refetch } = useMedia();
  const api = useMediaApi();
  const items = data?.items ?? null;
  const [query, setQuery] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);
  const [dragging, setDragging] = React.useState(false);

  const words = React.useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const found = React.useMemo(() => (items && words.length > 0 ? items.filter((i) => matches(i, words)) : null), [items, words]);
  const going = React.useMemo(() => (items ? continueList(items) : []), [items]);
  const later = React.useMemo(() => (items ? watchLaterList(items) : []), [items]);

  const card = (item: MediaItem) => (
    <VideoCard
      key={item.id}
      item={item}
      onWatchLater={() => {
        api.setWatchLater(item, item.watchLaterAt === null);
      }}
      onRemove={() => {
        api.remove(item);
      }}
    />
  );

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-8 rounded-card transition-shadow", dragging && "ring-2 ring-signal ring-offset-8 ring-offset-sheet")}
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
        void api.addFile(file, null).then((item) => {
          if (item) openWatch(item.id);
        });
      }}
    >
      <div className="flex flex-col gap-3">
        <AddBar
          onAdded={(item) => {
            openWatch(item.id);
          }}
        />
        {items && items.length > 0 ? (
          <label className="relative flex max-w-md items-center">
            <span className="sr-only">Search videos</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.currentTarget.value);
              }}
              placeholder="Search videos and shows"
              className="h-10 w-full rounded-pill bg-foreground/6 pr-4 pl-10 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested"
            />
          </label>
        ) : null}
      </div>

      {failed ? (
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          Couldn&apos;t load the library.
          <button type="button" className="font-medium text-signal-ink underline-offset-2 hover:underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : items === null ? (
        <div aria-busy aria-label="Loading videos" className={GRID}>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="aspect-video rounded-[14px] bg-foreground/6 dark:bg-card-nested" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink-2">Open a video or a folder of them, drop a file here, or paste a link.</p>
      ) : found ? (
        <Group title={`${String(found.length)} ${found.length === 1 ? "match" : "matches"}`}>
          {found.length > 0 ? <div className={GRID}>{found.slice(0, shown).map(card)}</div> : <p className="text-[13px] text-ink-2">Nothing matches.</p>}
        </Group>
      ) : (
        <>
          {going.length > 0 ? (
            <Group title="Continue">
              <div className={GRID}>{going.map(card)}</div>
            </Group>
          ) : null}
          {later.length > 0 ? (
            <Group title="Watch later">
              <div className={GRID}>{later.map(card)}</div>
            </Group>
          ) : null}
          <Group title="All">
            <div className={GRID}>{items.slice(0, shown).map(card)}</div>
          </Group>
        </>
      )}
      {items && (found ?? items).length > shown ? (
        <button
          type="button"
          className={buttonClass("ghost", "pill-sm", "self-center bg-foreground/6 text-foreground dark:bg-card-nested")}
          onClick={() => {
            setShown((n) => n + PAGE * 2);
          }}
        >
          Show more <span className="tabular">({(found ?? items).length - shown} left)</span>
        </button>
      ) : null}
    </div>
  );
}
