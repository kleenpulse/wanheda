// Play history (T73, V66), pure parts. Kept on this device only, like the
// music index (V58): a row per track path with how often it was played and
// when last. Media Home's "Recently played" and "Most played" read it.
//
// A start is a track change in the player, or a repeat-one loop (the store's
// `playId`). A start counts once, after accumulated play time reaches 30 s or
// half the track, whichever comes first. Time accrues by the wall clock and
// only while the player says it's playing, so a scrub to the end never counts.

import { UNKNOWN_ALBUM, albumOrder, sortSongs, type Track } from "./library";

export type TrackStat = { path: string; count: number; lastPlayedAt: number };

/** Seconds of listening that make a start a play (or half the track, if that's sooner). */
export const COUNT_AFTER_S = 30;
/** The most one step may add: a laptop asleep mid-song isn't listening. */
export const STEP_MAX_S = 10;

/** The current start, and how much of it has been heard. */
export type Accrual = { playId: number; path: string; playedS: number; lastAt: number | null; counted: boolean };

/** What the accrual needs from the player. `playing` is false while a track is still loading. */
export type PlayerView = { playId: number; path: string | null; playing: boolean };

/** One step of the clock: adds the wall time since the last step while it was playing. */
export function accrue(a: Accrual | null, p: PlayerView, now: number): Accrual | null {
  if (p.path === null) return null;
  if (!a || a.playId !== p.playId || a.path !== p.path) return { playId: p.playId, path: p.path, playedS: 0, lastAt: p.playing ? now : null, counted: false };
  const add = a.lastAt === null ? 0 : Math.min(STEP_MAX_S, Math.max(0, (now - a.lastAt) / 1000));
  const lastAt = p.playing ? now : null;
  if (add === 0 && lastAt === a.lastAt) return a;
  return { ...a, playedS: a.playedS + add, lastAt };
}

/** Whether this start has just become a play. */
export function shouldCount(a: Accrual, durationS: number | null): boolean {
  if (a.counted) return false;
  const need = durationS !== null && durationS > 0 ? Math.min(COUNT_AFTER_S, durationS / 2) : COUNT_AFTER_S;
  return a.playedS >= need;
}

export function countPlay(prev: TrackStat | undefined, path: string, now: number): TrackStat {
  return { path, count: (prev?.count ?? 0) + 1, lastPlayedAt: now };
}

/**
 * Which stats a finished scan lets go: only the paths a completed scan of the
 * kept folder found gone. A failed, cancelled or unreachable scan prunes
 * nothing, so an unplugged drive can't wipe the history; nor does a file the
 * scan listed but couldn't open (a drive pulled mid-scan), though it leaves
 * the index. A folder change clears the index first, so it reports nothing
 * removed and the old folder's history stays (it just doesn't show).
 */
export function pruneList(o: { phase: "done" | "failed" | "cancelled"; kept: boolean; removed: readonly string[]; unreadable?: readonly string[] }): string[] {
  if (o.phase !== "done" || !o.kept) return [];
  const keep = new Set(o.unreadable ?? []);
  return o.removed.filter((p) => !keep.has(p));
}

// ---- What Home shows ----

/** A recently played album, or a mix of the songs in one folder (untagged files have no album). */
export type PlayGroup = {
  key: string;
  kind: "album" | "folder";
  label: string;
  /** The album's artist; empty for a folder mix. */
  sub: string;
  tracks: Track[];
  /** Up to four distinct covers, for the folder mosaic. */
  covers: string[];
  durationS: number;
  lastPlayedAt: number;
};

const folderName = (folder: string) => folder.split("/").at(-1) || "Top folder";

/** Albums and folder mixes, most recently played first. */
export function recentGroups(stats: ReadonlyMap<string, TrackStat>, tracks: readonly Track[], limit = 12): PlayGroup[] {
  const groups = new Map<string, PlayGroup>();
  for (const t of tracks) {
    const album = t.album !== UNKNOWN_ALBUM;
    const key = album ? `album:${t.albumArtist}\u0000${t.album}` : `folder:${t.folder}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, kind: album ? "album" : "folder", label: album ? t.album : folderName(t.folder), sub: album ? t.albumArtist : "", tracks: [], covers: [], durationS: 0, lastPlayedAt: 0 };
      groups.set(key, g);
    }
    g.tracks.push(t);
    g.durationS += t.durationS ?? 0;
    if (t.coverKey && g.covers.length < 4 && !g.covers.includes(t.coverKey)) g.covers.push(t.coverKey);
    const s = stats.get(t.path);
    if (s && s.lastPlayedAt > g.lastPlayedAt) g.lastPlayedAt = s.lastPlayedAt;
  }
  return [...groups.values()]
    .filter((g) => g.lastPlayedAt > 0)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
    .slice(0, limit)
    .map((g) => ({ ...g, tracks: g.tracks.sort(albumOrder) }));
}

/** A track with no genre tag is filed under this. */
export const UNKNOWN_GENRE = "Unknown";
export const genreOf = (t: Pick<Track, "genre">): string => t.genre ?? UNKNOWN_GENRE;

const byPlays = (stats: ReadonlyMap<string, TrackStat>) => (a: Track, b: Track) => {
  const x = stats.get(a.path);
  const y = stats.get(b.path);
  return (y?.count ?? 0) - (x?.count ?? 0) || (y?.lastPlayedAt ?? 0) - (x?.lastPlayedAt ?? 0);
};

/** The most played tracks (played at least once), in one genre or all (`null`). */
export function mostPlayed(stats: ReadonlyMap<string, TrackStat>, tracks: readonly Track[], genre: string | null, limit = 20): Track[] {
  const played = tracks.filter((t) => (stats.get(t.path)?.count ?? 0) > 0 && (genre === null || genreOf(t) === genre));
  // Title order first, so equal counts and times stay put between renders.
  return sortSongs(played).sort(byPlays(stats)).slice(0, limit);
}

/** The top genres by plays, for the chips; empty unless there are two or more to choose between. */
export function genreChips(stats: ReadonlyMap<string, TrackStat>, tracks: readonly Track[], max = 5): string[] {
  const plays = new Map<string, number>();
  for (const t of tracks) {
    const n = stats.get(t.path)?.count ?? 0;
    if (n > 0) plays.set(genreOf(t), (plays.get(genreOf(t)) ?? 0) + n);
  }
  if (plays.size < 2) return [];
  return [...plays.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([g]) => g);
}

/** Every song, most played first; the rest after, in title order (Music → Songs, "See all"). */
export function sortByPlays(tracks: readonly Track[], stats: ReadonlyMap<string, TrackStat>): Track[] {
  return sortSongs(tracks).sort(byPlays(stats));
}
