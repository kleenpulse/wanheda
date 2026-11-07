"use client";

import * as React from "react";
import Link from "next/link";
import { Music, Shuffle } from "lucide-react";
import { useMusicLibrary } from "@/components/media/music-library";
import { useMusicPlayer } from "@/components/media/music-player";
import { NowPlayingCard } from "@/components/media/now-playing-card";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { SampleChip, WidgetCard } from "./widget-card";

// Home's "Now playing" (T64): the song the player holds, in the now-playing
// card (Motion Garden's LiveActivity media design). Nothing playing, it
// offers to shuffle the library this device already indexed, so music is one
// press from Home.

export function NowPlayingWidget() {
  const demo = useAccount().kind !== "owner";
  const track = useMusicPlayer((s) => s.track);
  const tracks = useMusicLibrary((s) => s.tracks);

  React.useEffect(() => {
    useMusicLibrary.getState().load(demo);
  }, [demo]);

  if (track) {
    return (
      <section aria-label="Now playing" className="h-full min-h-0 overflow-hidden rounded-card shadow-card">
        <NowPlayingCard className="h-full" />
      </section>
    );
  }

  return (
    <WidgetCard title="Now playing" icon={Music} note={demo ? <SampleChip /> : undefined}>
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-ink-2">
            {tracks && tracks.length > 0 ? "Nothing playing." : "Nothing playing. Pick your music folder to play from it."}
          </p>
          <div className="flex flex-wrap gap-2">
            {tracks && tracks.length > 0 ? (
              <button
                type="button"
                className={buttonClass("inverse", "pill-sm")}
                onClick={() => {
                  const player = useMusicPlayer.getState();
                  if (!player.shuffle) player.setShuffle(true);
                  player.playList(tracks, Math.floor(Math.random() * tracks.length));
                }}
              >
                <Shuffle aria-hidden />
                Shuffle <span className="tabular">{tracks.length.toLocaleString()}</span> songs
              </button>
            ) : null}
            <Link href="/media?tab=music" className={buttonClass("surface", "pill-sm")}>
              Open music
            </Link>
          </div>
        </div>
    </WidgetCard>
  );
}
