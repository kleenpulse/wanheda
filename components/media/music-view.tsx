"use client";

import * as React from "react";
import { AudioLines, ChevronLeft, FolderOpen, FolderSync, Pause, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { BROWSE, groupTracks, searchTracks, sortSongs, type Browse, type Group, type Track } from "@/lib/media/library";
import { formatDuration } from "@/lib/media/media";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { hasFolderPicker, useMusicLibrary } from "./music-library";
import { preloadMusicEngine, useMusicPlayer } from "./music-player";
import { VirtualList } from "./virtual-list";

/**
 * The list takes the height left in the page and runs to the sheet's bottom edge, under the dock;
 * its last row clears the dock by the page's FLOATING_BAR_CLEARANCE (page-frame.tsx). A floor of a
 * few rows, so a very short window scrolls the page rather than hide the list.
 */
const LIST_FILL = "min-h-40 flex-1 pb-[calc(76px+2rem)]";

// The music library (T63, V58): pick a folder once, browse by artist, album,
// genre or folder, or search. A song plays on a click, with the rest of the
// list it was picked from queued after it (T64).

const ROW = 56;
const BROWSE_OPTIONS = [
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
  { value: "genres", label: "Genres" },
  { value: "folders", label: "Folders" },
  { value: "songs", label: "Songs" },
] as const satisfies readonly { value: Browse; label: string }[];

const isBrowse = (v: string | null): v is Browse => v !== null && (BROWSE as readonly string[]).includes(v);

function TrackRow({ t, onPlay }: { t: Track; onPlay: () => void }) {
  const duration = formatDuration(t.durationS);
  // Only this row re-renders when the playing track changes.
  const state = useMusicPlayer((s) => (s.track?.path === t.path ? s.status : null));
  const current = state !== null && state !== "idle";
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-current={current ? "true" : undefined}
      aria-label={`${current ? (state === "playing" ? "Playing" : "Paused") : "Play"} ${t.title} by ${t.artist}`}
      className={cn(
        "flex h-full w-full items-center gap-3 rounded-[12px] px-3 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card-nested",
        current && "bg-signal-soft hover:bg-signal-soft dark:hover:bg-signal-soft",
      )}
    >
      <span className="relative shrink-0">
        <Cover coverKey={t.coverKey} className="size-9 rounded-[8px]" />
        {current ? (
          <span aria-hidden className="absolute inset-0 grid place-items-center rounded-[8px] bg-island/55 text-signal">
            {state === "playing" ? <AudioLines className="size-4" /> : <Pause className="size-4 fill-current" />}
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm font-medium", current ? "text-signal-ink dark:text-signal" : "text-foreground")}>{t.title}</span>
        <span className="truncate text-xs text-ink-2">
          {t.artist} · {t.album}
        </span>
      </span>
      {duration ? <span className="tabular shrink-0 text-xs text-ink-2">{duration}</span> : null}
    </button>
  );
}

function GroupRow({ g, onOpen }: { g: Group; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full items-center gap-3 rounded-[12px] px-3 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-card-nested"
    >
      <Cover coverKey={g.coverKey} className="size-9 rounded-[8px]" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{g.label}</span>
        <span className="truncate text-xs text-ink-2">
          {g.sub ? `${g.sub} · ` : ""}
          <span className="tabular">{g.count.toLocaleString()}</span> {g.count === 1 ? "track" : "tracks"}
        </span>
      </span>
    </button>
  );
}

function FolderBar() {
  const folder = useMusicLibrary((s) => s.folder);
  const scan = useMusicLibrary((s) => s.scan);
  const lib = useMusicLibrary.getState;
  const demo = useAccount().kind !== "owner";
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pick = () => {
    if (hasFolderPicker()) void lib().pickFolder();
    else inputRef.current?.click();
  };
  const chip = buttonClass("ghost", "pill-sm", "bg-foreground/6 text-foreground dark:bg-card-nested");

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        name="music-folder"
        hidden
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          lib().pickFiles(files);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {demo && folder.kind === "none" ? (
          <p className="text-[13px] text-ink-2">Demo: generated test tones. Pick a folder to see your own music in this tab.</p>
        ) : folder.kind === "none" ? (
          <p className="text-[13px] text-ink-2">Pick the folder your music lives in. It&apos;s read on this device and never uploaded.</p>
        ) : (
          <p className="text-[13px] text-ink-2">
            <span className="font-medium text-foreground">{folder.name}</span>
            {folder.kind === "session" ? " · this tab only" : null}
          </p>
        )}
        {folder.kind === "reconnect" ? (
          <button type="button" className={buttonClass("inverse", "pill-sm")} onClick={() => void lib().reconnect()}>
            <FolderSync aria-hidden />
            Reconnect {folder.name}
          </button>
        ) : (
          <button type="button" className={folder.kind === "none" && !demo ? buttonClass("inverse", "pill-sm") : chip} onClick={pick}>
            <FolderOpen aria-hidden />
            {folder.kind === "none" ? "Pick music folder" : "Change folder"}
          </button>
        )}
        {folder.kind === "ready" ? (
          <button type="button" className={chip} disabled={scan?.phase === "scanning"} onClick={() => void lib().rescan()}>
            <RefreshCw aria-hidden />
            Rescan
          </button>
        ) : null}
      </div>
      {scan ? (
        <p role="status" className={cn("flex items-center gap-1.5 text-xs", scan.phase === "failed" ? "text-signal-ink" : "text-ink-2")}>
          {scan.phase === "failed" ? <TriangleAlert aria-hidden className="size-3.5" /> : null}
          {scan.phase === "failed" ? (
            `The scan stopped: ${scan.message ?? "unknown error"}`
          ) : scan.phase === "scanning" ? (
            <span className="tabular">
              Scanning {scan.toParse > 0 ? `${scan.parsed.toLocaleString()} of ${scan.toParse.toLocaleString()} new or changed files` : `${scan.seen.toLocaleString()} files`}
            </span>
          ) : (
            <span className="tabular">
              Up to date: {scan.parsed.toLocaleString()} read
              {scan.bad > 0 ? `, ${scan.bad.toLocaleString()} skipped (couldn't be read)` : ""}
            </span>
          )}
        </p>
      ) : null}
    </div>
  );
}

export function MusicView() {
  const demo = useAccount().kind !== "owner";
  const tracks = useMusicLibrary((s) => s.tracks);
  const browseParam = useUrlParam("b");
  const groupKey = useUrlParam("g");
  // Songs first: the music this device holds, one click from playing (user 2026-11-07).
  const browse: Browse = isBrowse(browseParam) ? browseParam : "songs";
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    useMusicLibrary.getState().load(demo);
    preloadMusicEngine();
  }, [demo]);

  const all = React.useMemo(() => tracks ?? [], [tracks]);
  const groups = React.useMemo(() => (browse === "songs" ? [] : groupTracks(all, browse)), [all, browse]);
  const open = groupKey !== null ? groups.find((g) => g.key === groupKey) : undefined;
  const songs = React.useMemo(() => {
    if (query.trim()) return sortSongs(searchTracks(all, query));
    if (open) return open.tracks;
    return browse === "songs" ? sortSongs(all) : null;
  }, [all, query, open, browse]);

  return (
    // Fills the page (page-frame.tsx): the list scrolls, the page doesn't.
    <div data-page-fill className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <FolderBar />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Browse"
          value={browse}
          options={BROWSE_OPTIONS}
          onChange={(v) => {
            replaceUrlParams({ b: v, g: null });
          }}
        />
        <label className="relative flex min-w-48 flex-1 items-center">
          <span className="sr-only">Search music</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
            }}
            placeholder="Search songs, artists, albums"
            className="h-10 w-full rounded-pill bg-foreground/6 pr-4 pl-10 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested"
          />
        </label>
      </div>

      {open && !query.trim() ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={buttonClass("ghost", "circle-sm")}
            aria-label="Back"
            onClick={() => {
              replaceUrlParams({ g: null });
            }}
          >
            <ChevronLeft aria-hidden />
          </button>
          <p className="min-w-0 truncate font-display text-lg leading-tight text-foreground">
            {open.label}
            {open.sub ? <span className="text-ink-2"> · {open.sub}</span> : null}
          </p>
        </div>
      ) : null}

      {tracks === null ? (
        <p aria-busy className="px-1 text-[13px] text-ink-2">
          Reading the library…
        </p>
      ) : all.length === 0 ? null : songs ? (
        songs.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-2">Nothing matches.</p>
        ) : (
          <VirtualList
            label={query.trim() ? "Search results" : (open?.label ?? "Songs")}
            items={songs}
            rowHeight={ROW}
            getKey={(t) => t.path}
            render={(t, i) => (
              <TrackRow
                t={t}
                onPlay={() => {
                  const player = useMusicPlayer.getState();
                  // The playing track again: pause or carry on, don't start over.
                  if (player.track?.path === t.path && player.status !== "idle") player.toggle();
                  else player.playList(songs, i);
                }}
              />
            )}
            className={LIST_FILL}
          />
        )
      ) : (
        <VirtualList
          label={BROWSE_OPTIONS.find((o) => o.value === browse)?.label ?? "Library"}
          items={groups}
          rowHeight={ROW}
          getKey={(g) => g.key}
          render={(g) => (
            <GroupRow
              g={g}
              onOpen={() => {
                replaceUrlParams({ g: g.key });
              }}
            />
          )}
          className={LIST_FILL}
        />
      )}
    </div>
  );
}
