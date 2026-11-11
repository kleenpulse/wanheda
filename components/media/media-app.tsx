"use client";

import { Segmented } from "@/components/ui/segmented";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { MediaHome } from "./media-home";
import { useMusicPlayer } from "./music-player";
import { MusicView, useMusicLibraryLoad } from "./music-view";
import { NowPlayingBar } from "./now-playing-bar";
import { VideosGrid } from "./videos-grid";
import { FOLDER_PARAM } from "./watch-nav";
import { WatchView } from "./watch-view";

// /media (T61–T64, T73): Home | Videos | Music, and the Watch view over any
// of them. A bare /media opens Home. `?tab=` keeps the tab on reload; `?m=` is
// the item playing, and the tab it was opened from stays beside it, so Back
// returns there. Every tab reads data already on the device, so a hop between
// them paints at once (V24).

type Tab = "home" | "videos" | "music";

const TABS = [
  { value: "home", label: "Home" },
  { value: "videos", label: "Videos" },
  { value: "music", label: "Music" },
] as const satisfies readonly { value: Tab; label: string }[];

const tabOf = (v: string | null): Tab => (v === "videos" || v === "music" ? v : "home");

/**
 * The tabs, in the page header beside the title (user 2026-11-08: as Money's
 * are). They and the app read the same `?tab`, so they never disagree.
 */
export function MediaTabs() {
  const tab = tabOf(useUrlParam("tab"));
  return (
    <Segmented
      label="Media"
      value={tab}
      options={TABS}
      onChange={(v) => {
        // A tab closes the Watch view too: the player is one click from any of them.
        replaceUrlParams({ tab: v === "home" ? null : v, m: null, b: null, g: null, sort: null, [FOLDER_PARAM]: null });
      }}
    />
  );
}

export function MediaApp() {
  const tab = tabOf(useUrlParam("tab"));
  const watching = useUrlParam("m") !== null;
  const music = useMusicPlayer((s) => s.status !== "idle" && s.track !== null);
  // The now-playing bar: Home and Music only, never over the Watch view (V66).
  const bar = music && !watching && tab !== "videos";
  useMusicLibraryLoad();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      {watching ? <WatchView /> : tab === "music" ? <MusicView barRoom={bar} /> : tab === "videos" ? <VideosGrid /> : <MediaHome barRoom={bar} />}
      {bar ? <NowPlayingBar /> : null}
    </div>
  );
}
