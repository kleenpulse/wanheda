"use client";

import * as React from "react";
import { ArrowLeft, Search } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { displayTitle, folderGroups, LOOSE_LABEL } from "@/lib/media/episodes";
import { continueList, watchLaterList } from "@/lib/media/playback";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { AddBar } from "./add-bar";
import { FolderCard, VideoCard } from "./media-cards";
import { useMedia, useMediaApi } from "./use-media";
import { FOLDER_PARAM, openFolder, openWatch } from "./watch-nav";

// The Videos tab (T73): Continue, Watch later, then the library as the folders
// its videos were added from, and the loose videos after them, with a search
// and the AddBar on top. A folder opens in place (`?folder=`, so Back returns
// to the folders); a card opens the Watch view; a file dropped anywhere on the
// tab joins the library and opens.

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-x-4 gap-y-6";
/** A list shows this many at first: a 2000-item library mounts in pages, not at once. */
const PAGE = 48;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function matches(item: MediaItem, words: readonly string[]): boolean {
  const named = displayTitle(item);
  const hay = fold(`${item.title} ${named.show ?? ""} ${named.title} ${item.uri}`);
  return words.every((w) => hay.includes(w));
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="readout">
        {title}
        {count === undefined ? null : <span className="tabular ml-2 text-ink-3">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export function VideosGrid() {
  const { data, failed, refetch } = useMedia();
  const api = useMediaApi();
  const items = data?.items ?? null;
  const [query, setQuery] = React.useState("");
  /** How many of the list are mounted, and for which folder ("" = none): a move in or out starts at one page again, Back and Forward included. */
  const [page, setPage] = React.useState({ at: "", n: PAGE });
  const [dragging, setDragging] = React.useState(false);

  const words = React.useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const found = React.useMemo(() => (items && words.length > 0 ? items.filter((i) => matches(i, words)) : null), [items, words]);
  const going = React.useMemo(() => (items ? continueList(items) : []), [items]);
  const later = React.useMemo(() => (items ? watchLaterList(items) : []), [items]);
  /** The library as its folders, and the loose videos under the key "". */
  const groups = React.useMemo(() => (items ? folderGroups(items) : []), [items]);
  const folders = React.useMemo(() => groups.filter((g) => g.key !== ""), [groups]);
  const loose = React.useMemo(() => groups.find((g) => g.key === "")?.items ?? [], [groups]);
  /** The folder open now. One that's gone (its last video removed, an old link) reads as none. */
  const folderKey = useUrlParam(FOLDER_PARAM);
  const open = folderKey ? (folders.find((g) => g.key === folderKey) ?? null) : null;
  const at = open?.key ?? "";
  const shown = page.at === at ? page.n : PAGE;
  /** The one list on screen that pages: the matches, the open folder's videos, or the loose videos. */
  const listed = found ?? open?.items ?? loose;

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
      ) : open ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            className={buttonClass("ghost", "pill-sm", "self-start bg-foreground/6 text-foreground dark:bg-card-nested")}
            onClick={() => {
              replaceUrlParams({ [FOLDER_PARAM]: null });
            }}
          >
            <ArrowLeft aria-hidden />
            All folders
          </button>
          <Group title={open.label} count={open.items.length}>
            <div className={GRID}>{open.items.slice(0, shown).map(card)}</div>
          </Group>
        </div>
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
          {folders.length > 0 ? (
            <Group title="Folders" count={folders.length}>
              <div className={GRID}>
                {folders.map((g) => (
                  <FolderCard
                    key={g.key}
                    label={g.label}
                    items={g.items}
                    onOpen={() => {
                      openFolder(g.key);
                    }}
                  />
                ))}
              </div>
            </Group>
          ) : null}
          {loose.length > 0 ? (
            // With no folders the loose videos are the whole library: "All", as before.
            <Group title={folders.length > 0 ? LOOSE_LABEL : "All"} count={loose.length}>
              <div className={GRID}>{loose.slice(0, shown).map(card)}</div>
            </Group>
          ) : null}
        </>
      )}
      {items && listed.length > shown ? (
        <button
          type="button"
          className={buttonClass("ghost", "pill-sm", "self-center bg-foreground/6 text-foreground dark:bg-card-nested")}
          onClick={() => {
            setPage({ at, n: shown + PAGE * 2 });
          }}
        >
          Show more <span className="tabular">({listed.length - shown} left)</span>
        </button>
      ) : null}
    </div>
  );
}
