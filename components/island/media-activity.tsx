"use client";

import type { IslandActivity } from "@/components/island/live-activity";
import { useMusicPlayer } from "@/components/media/music-player";
import { Equalizer, NowPlayingArt, NowPlayingCard } from "@/components/media/now-playing-card";

// The island's `media` activity (FR-ISLAND-3, V61), in Motion Garden's
// LiveActivity media design: the cover and a dancing equalizer on the pill,
// the now-playing card (art, title, wave scrub, transport) when it opens.
// Live while the player holds a song, playing or paused.

export const MEDIA_ACTIVITY = "media";

function MediaTrailing() {
  const playing = useMusicPlayer((s) => s.status === "playing");
  return <Equalizer playing={playing} />;
}

function MediaStatusText() {
  const paused = useMusicPlayer((s) => s.status === "paused");
  const artist = useMusicPlayer((s) => s.track?.artist ?? "");
  return `, ${artist}, ${paused ? "paused" : "playing"}`;
}

/** The activity for the song the player holds. */
export function mediaActivity(title: string): IslandActivity {
  return {
    id: MEDIA_ACTIVITY,
    label: title,
    status: <MediaStatusText />,
    leading: <NowPlayingArt />,
    trailing: <MediaTrailing />,
    expanded: <NowPlayingCard />,
  };
}
