"use client";

import * as React from "react";
import { FolderOpen, Sparkles } from "lucide-react";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { replaceUrlParams } from "@/hooks/use-url-param";
import { showsOf } from "@/lib/media/episodes";
import { sortItems } from "@/lib/media/media";
import { continueList, watchLaterList } from "@/lib/media/playback";
import { genreChips, mostPlayed, recentGroups } from "@/lib/media/stats";
import { cn } from "@/lib/utils";
import { AddBar } from "./add-bar";
import { AlbumCard, FolderMixCard, ShowCard, SongCard, VideoCard } from "./media-cards";
import { hasFolderPicker, useMusicLibrary } from "./music-library";
import { useMusicPlayer } from "./music-player";
import { Shelf, ShelfItem } from "./shelf";
import { useTrackStats } from "./track-stats";
import { useMedia } from "./use-media";
import { openWatch } from "./watch-nav";

// Media Home (T73, V66): what to pick up and what to play, in a fixed order:
// Continue watching, Recently played, Most played, Shows, Watch later,
// Recently added. Every shelf reads data already on the device (the media
// cache, the music index, the play history), so the tab paints at once (V24).
// A shelf with nothing in it isn't shown; with both libraries empty, one card
// says how to start.

const VIDEO_CARD = "w-64 @3xl:w-72";
const SQUARE_CARD = "w-40 @3xl:w-44";
const SONG_CARD = "w-36 @3xl:w-40";
const SHELF_MAX = 16;

const ALL = "*";

/** Room under the last shelf for the now-playing bar, when it shows (its height and gap). */
export const BAR_ROOM = "h-18";

export function MediaHome({ barRoom }: { barRoom: boolean }) {
  const { data } = useMedia();
  const items = data?.items ?? null;
  const tracks = useMusicLibrary((s) => s.tracks);
  const stats = useTrackStats((s) => s.stats);
  const statsLoaded = useTrackStats((s) => s.loaded);
  const [genre, setGenre] = React.useState<string>(ALL);

  const going = React.useMemo(() => (items ? continueList(items, SHELF_MAX) : []), [items]);
  const later = React.useMemo(() => (items ? watchLaterList(items).slice(0, SHELF_MAX) : []), [items]);
  const added = React.useMemo(() => (items ? sortItems(items).slice(0, SHELF_MAX) : []), [items]);
  const shows = React.useMemo(() => (items ? showsOf(items).slice(0, SHELF_MAX) : []), [items]);
  const music = React.useMemo(() => tracks ?? [], [tracks]);
  const recent = React.useMemo(() => recentGroups(stats, music), [stats, music]);
  const chips = React.useMemo(() => genreChips(stats, music), [stats, music]);
  // A chip that's gone (the history changed) falls back to All.
  const shownGenre = genre !== ALL && chips.includes(genre) ? genre : null;
  const top = React.useMemo(() => mostPlayed(stats, music, shownGenre), [stats, music, shownGenre]);

  const toVideos = () => {
    replaceUrlParams({ tab: "videos" });
  };

  // Both libraries read and empty: one way in, not six empty shelves.
  if (items !== null && items.length === 0 && tracks !== null && tracks.length === 0) {
    return (
      <>
        <FirstRun />
        {barRoom ? <div aria-hidden className={cn("shrink-0", BAR_ROOM)} /> : null}
      </>
    );
  }

  return (
    <div className="@container flex min-w-0 flex-col gap-9">
      {going.length > 0 ? (
        <Shelf title="Continue watching" onSeeAll={toVideos}>
          {going.map((item) => (
            <ShelfItem key={item.id} className={VIDEO_CARD}>
              <VideoCard item={item} />
            </ShelfItem>
          ))}
        </Shelf>
      ) : null}

      {recent.length > 0 ? (
        <Shelf
          title="Recently played"
          onSeeAll={() => {
            replaceUrlParams({ tab: "music", b: "albums", g: null, sort: null });
          }}
        >
          {recent.map((g) => (
            <ShelfItem key={g.key} className={SQUARE_CARD}>
              {g.kind === "album" ? <AlbumCard group={g} /> : <FolderMixCard group={g} />}
            </ShelfItem>
          ))}
        </Shelf>
      ) : null}

      {top.length > 0 ? (
        <Shelf
          title="Most played"
          onSeeAll={() => {
            replaceUrlParams({ tab: "music", b: "songs", g: null, sort: "plays" });
          }}
          tools={
            chips.length > 0 ? (
              <Segmented
                label="Genre"
                size="sm"
                value={shownGenre ?? ALL}
                options={[{ value: ALL, label: "All" }, ...chips.map((g) => ({ value: g, label: g }))]}
                onChange={setGenre}
              />
            ) : null
          }
        >
          {top.map((t, i) => (
            <ShelfItem key={t.path} className={SONG_CARD}>
              <SongCard
                track={t}
                onPlay={() => {
                  useMusicPlayer.getState().playList(top, i);
                }}
              />
            </ShelfItem>
          ))}
        </Shelf>
      ) : null}

      {shows.length > 0 ? (
        <Shelf title="Shows" onSeeAll={toVideos}>
          {shows.map((s) => (
            <ShelfItem key={s.showKey} className={VIDEO_CARD}>
              <ShowCard show={s} />
            </ShelfItem>
          ))}
        </Shelf>
      ) : null}

      {later.length > 0 ? (
        <Shelf title="Watch later" onSeeAll={toVideos}>
          {later.map((item) => (
            <ShelfItem key={item.id} className={VIDEO_CARD}>
              <VideoCard item={item} />
            </ShelfItem>
          ))}
        </Shelf>
      ) : null}

      {added.length > 0 ? (
        <Shelf title="Recently added" onSeeAll={toVideos}>
          {added.map((item) => (
            <ShelfItem key={item.id} className={VIDEO_CARD}>
              <VideoCard item={item} />
            </ShelfItem>
          ))}
        </Shelf>
      ) : null}

      {/* Played nothing yet, but there is music: say where history will show, once, quietly. */}
      {statsLoaded && recent.length === 0 && music.length > 0 ? <NoHistoryNote /> : null}
      {barRoom ? <div aria-hidden className={cn("shrink-0", BAR_ROOM)} /> : null}
    </div>
  );
}

function NoHistoryNote() {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-2">
      <Sparkles aria-hidden className="size-4 shrink-0 text-signal-ink dark:text-signal" />
      Songs you play show here as Recently played and Most played. The history stays on this device.
      <button
        type="button"
        className="font-medium text-signal-ink underline-offset-2 hover:underline dark:text-signal"
        onClick={() => {
          replaceUrlParams({ tab: "music" });
        }}
      >
        Open Music
      </button>
    </p>
  );
}

/** Nothing in either library: open a folder of videos, pick the music folder, or paste a link. */
function FirstRun() {
  const demo = useAccount().kind !== "owner";
  const music = useMusicLibrary.getState;
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <section aria-labelledby="media-first-run" className="flex max-w-2xl flex-col gap-5 rounded-card bg-foreground/4 p-6 dark:bg-card-nested">
      <div className="flex flex-col gap-1">
        <h2 id="media-first-run" className="font-display text-xl leading-tight text-foreground">
          Start your media library
        </h2>
        <p className="text-[13px] text-ink-2">Videos and music play from this device and are never uploaded. Links play from where they live.</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="readout">Videos and links</p>
        <AddBar onAdded={(item) => { openWatch(item.id); }} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="readout">Music</p>
        <input
          ref={inputRef}
          type="file"
          name="music-folder-first-run"
          hidden
          multiple
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            music().pickFiles(files);
            replaceUrlParams({ tab: "music" });
          }}
        />
        <div>
          <button
            type="button"
            className={buttonClass("inverse", "pill-sm")}
            onClick={() => {
              if (hasFolderPicker()) {
                void music()
                  .pickFolder()
                  .then(() => {
                    if (music().folder.kind !== "none") replaceUrlParams({ tab: "music" });
                  });
              } else inputRef.current?.click();
            }}
          >
            <FolderOpen aria-hidden />
            Pick your music folder
          </button>
        </div>
        {demo ? <p className="text-xs text-ink-3">Demo: a picked folder stays in this tab only.</p> : null}
      </div>
    </section>
  );
}
