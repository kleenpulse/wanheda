// Where each item was left (V55), pure parts: the client keeps a local copy
// (written every 5 s while playing), lays it over the server's, and sends it
// on a slower clock. Newest `lastPlayedAt` wins everywhere.

import { newestState, resumeAt } from "./resume";
import type { MediaItem, MediaProgress } from "./types";

export const LOCAL_EVERY_MS = 5_000;
export const SERVER_EVERY_MS = 15_000;

export type LocalProgress = { positionS: number; watched: boolean; at: number };

export function toProgress(l: LocalProgress): MediaProgress {
  return { positionS: l.positionS, watched: l.watched, lastPlayedAt: new Date(l.at).toISOString() };
}

/** The server's progress with this device's newer copy laid over it. */
export function layProgress(items: readonly MediaItem[], local: Readonly<Record<string, LocalProgress>>): MediaItem[] {
  return items.map((i) => {
    const mine = local[i.id];
    if (!mine) return i;
    const progress = newestState(i.progress, toProgress(mine));
    return progress === i.progress ? i : { ...i, progress };
  });
}

/** Items that would resume (V55's window, not watched), most recently played first (the "Continue" list). */
export function continueList(items: readonly MediaItem[], limit = 8): (MediaItem & { progress: MediaProgress })[] {
  return items
    .filter((i): i is MediaItem & { progress: MediaProgress } => i.progress !== null && resumeAt(i.progress, i.durationS) > 0)
    .sort((a, b) => b.progress.lastPlayedAt.localeCompare(a.progress.lastPlayedAt))
    .slice(0, limit);
}

/** The watch-later queue, oldest first (a queue). Watched items leave it. */
export function watchLaterList(items: readonly MediaItem[]): MediaItem[] {
  return items
    .filter((i): i is MediaItem & { watchLaterAt: string } => i.watchLaterAt !== null && !(i.progress?.watched ?? false))
    .sort((a, b) => a.watchLaterAt.localeCompare(b.watchLaterAt));
}

/** When a tick should write: locally every 5 s, to the server every 15 s; a pause, end or hide writes both now. */
export function writesDue(
  now: number,
  last: { local: number; server: number },
  reason: "tick" | "pause" | "ended" | "hidden",
): { local: boolean; server: boolean } {
  if (reason !== "tick") return { local: true, server: true };
  return { local: now - last.local >= LOCAL_EVERY_MS, server: now - last.server >= SERVER_EVERY_MS };
}
