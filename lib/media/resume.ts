// Resume and watched rules (V55). Pure; T62 wires them to the player.

export const RESUME_MIN_S = 10;
export const RESUME_TAIL_S = 30;
export const WATCHED_SHARE = 0.95;

/** Watched once 95 % is played or the video ended. */
export function isWatched(positionS: number, durationS: number | null, ended = false): boolean {
  if (ended) return true;
  if (!durationS || durationS <= 0) return false;
  return positionS >= durationS * WATCHED_SHARE;
}

/** Where to start: the saved position iff 10 s < pos < duration − 30 s and not watched; else 0. */
export function resumeAt(saved: { positionS: number; watched: boolean } | null, durationS: number | null): number {
  if (!saved || saved.watched) return 0;
  const pos = saved.positionS;
  if (!Number.isFinite(pos) || pos <= RESUME_MIN_S) return 0;
  if (durationS && durationS > 0 && pos >= durationS - RESUME_TAIL_S) return 0;
  return pos;
}

/** Cross-device: the newest `lastPlayedAt` wins (ISO strings compare by time). */
export function newestState<T extends { lastPlayedAt: string }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.lastPlayedAt) > Date.parse(a.lastPlayedAt) ? b : a;
}
