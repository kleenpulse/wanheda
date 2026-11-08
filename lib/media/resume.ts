// Resume and watched rules (V55). Pure; T62 wires them to the player.

export const RESUME_MIN_S = 10;
export const RESUME_TAIL_S = 30;
/** A short clip's cut-offs shrink to this share of its length (a 20 s clip resumes past 2 s). */
export const RESUME_SHARE = 0.1;
export const WATCHED_SHARE = 0.95;

/** Watched once 95 % is played or the video ended. */
export function isWatched(positionS: number, durationS: number | null, ended = false): boolean {
  if (ended) return true;
  if (!durationS || durationS <= 0) return false;
  return positionS >= durationS * WATCHED_SHARE;
}

/**
 * Where a saved place picks up: the position iff min < pos < duration − tail and not watched;
 * else 0. min = 10 s and tail = 30 s, each capped at 10 % of the length, so a short clip
 * resumes too (a bar on its row always means it will).
 */
export function resumeAt(saved: { positionS: number; watched: boolean } | null, durationS: number | null): number {
  if (!saved || saved.watched) return 0;
  const pos = saved.positionS;
  const known = durationS !== null && Number.isFinite(durationS) && durationS > 0;
  const min = known ? Math.min(RESUME_MIN_S, durationS * RESUME_SHARE) : RESUME_MIN_S;
  if (!Number.isFinite(pos) || pos <= min) return 0;
  if (known && pos >= durationS - Math.min(RESUME_TAIL_S, durationS * RESUME_SHARE)) return 0;
  return pos;
}

/** Cross-device: the newest `lastPlayedAt` wins (ISO strings compare by time). */
export function newestState<T extends { lastPlayedAt: string }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.lastPlayedAt) > Date.parse(a.lastPlayedAt) ? b : a;
}
