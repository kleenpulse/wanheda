"use client";

import Link from "next/link";
import { MusicModes } from "@/components/media/music-controls";
import { useMusicPlayer } from "@/components/media/music-player";
import { NowPlayingCard } from "@/components/media/now-playing-card";
import { formatDuration } from "@/lib/media/media";
import { upNext } from "@/lib/media/queue";

const UP_NEXT = 50;

/**
 * The music player mini window (T64): the now-playing card (Motion Garden's
 * LiveActivity media design), shuffle and repeat, and what plays next. It
 * reads the same store as the island and the Music list, so they never
 * disagree, and it keeps playing across app hops (V62).
 */
export function MusicWindow() {
  const track = useMusicPlayer((s) => s.track);
  const queue = useMusicPlayer((s) => s.queue);
  const next = queue ? upNext(queue, UP_NEXT) : [];

  if (!track) {
    return (
      <div className="p-4">
        <p className="text-[13px] text-ink-2">
          Nothing playing. Pick a song in{" "}
          <Link href="/media?tab=music" className="text-signal-ink underline-offset-2 hover:underline dark:text-signal">
            Music
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 pb-5">
      <NowPlayingCard className="shrink-0 rounded-[22px]" />
      <MusicModes tone="surface" />
      {next.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <p className="readout">Up next</p>
          <ol aria-label="Up next" className="-mx-2 min-h-0 flex-1 overflow-y-auto scroll-fade">
            {next.map(({ index, item }) => (
              <li key={`${String(index)}:${item.path}`}>
                <button
                  type="button"
                  onClick={() => {
                    useMusicPlayer.getState().jump(index);
                  }}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left outline-none hover:bg-card-nested focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-foreground">{item.title}</span>
                    <span className="truncate text-[11px] text-ink-2">{item.artist}</span>
                  </span>
                  {item.durationS ? <span className="tabular shrink-0 text-[11px] text-ink-3">{formatDuration(item.durationS)}</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
