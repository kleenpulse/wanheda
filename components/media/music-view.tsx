"use client";

import * as React from "react";
import { ChevronLeft, FolderOpen, FolderSync, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { BROWSE, groupTracks, searchTracks, sortSongs, type Browse, type Group, type Track } from "@/lib/media/library";
import { formatDuration } from "@/lib/media/media";
import { cn } from "@/lib/utils";
import { Cover } from "./cover";
import { hasFolderPicker, useMusicLibrary } from "./music-library";
import { VirtualList } from "./virtual-list";

// The music library (T63, V58): pick a folder once, browse by artist, album,
// genre or folder, or search. Playback arrives with T64; this view lists.

const ROW = 56;
const BROWSE_OPTIONS = [
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
  { value: "genres", label: "Genres" },
  { value: "folders", label: "Folders" },
  { value: "songs", label: "Songs" },
] as const satisfies readonly { value: Browse; label: string }[];

const isBrowse = (v: string | null): v is Browse => v !== null && (BROWSE as readonly string[]).includes(v);

function TrackRow({ t }: { t: Track }) {
  const duration = formatDuration(t.durationS);
  return (
    <div className="flex h-full items-center gap-3 rounded-[12px] px-3 hover:bg-foreground/5 dark:hover:bg-card-nested">
      <Cover coverKey={t.coverKey} className="size-9 rounded-[8px]" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{t.title}</span>
        <span className="truncate text-xs text-ink-2">
          {t.artist} · {t.album}
        </span>
      </span>
      {duration ? <span className="tabular shrink-0 text-xs text-ink-2">{duration}</span> : null}
    </div>
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
  const browse: Browse = isBrowse(browseParam) ? browseParam : "albums";
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    useMusicLibrary.getState().load(demo);
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
    <div className="flex min-w-0 flex-col gap-4">
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
            render={(t) => <TrackRow t={t} />}
            className="max-h-[min(70vh,48rem)]"
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
          className="max-h-[min(70vh,48rem)]"
        />
      )}
    </div>
  );
}
