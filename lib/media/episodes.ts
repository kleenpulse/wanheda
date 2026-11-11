import type { MediaItem } from "./types";

// Series from file names (T72): "Night.Harbor.S01E11.1080p.WEB-DL.x264.mkv" is
// episode 11 of season 1 of "Night Harbor". The up-next rail, the Season
// menu, the media keys and autoplay all follow the show's order.
//
// Parsed from the raw name, before any cleaning, with word boundaries, so a
// resolution (1920x1080), a codec (x264, H.265) or "E3 2019" is never read as
// an episode. Known misses, by design: multi-episode files (S01E01E02 is
// episode 1) and absolute anime numbering ("Show - 101").

export type Episode = {
  /** The show's name as shown ("Night Harbor"). */
  show: string;
  /** Lowercase letters and digits only: "The.Office.US" and "The Office (US)" are one show. */
  showKey: string;
  season: number;
  episode: number;
  /** The episode's own name when the file carries one ("The Reunion"), else null. */
  name: string | null;
};

const EXT = /\.[a-z0-9]{2,5}$/i;
/** Release tags: from the first one on, the rest of a scene name is noise. */
const RELEASE =
  /(?:^|[\s._\-[(])(?:2160p|1080p|720p|576p|480p|4k|uhd|hdr10?|dv|web[\s._-]?dl|web[\s._-]?rip|bluray|blu[\s._-]?ray|brrip|bdrip|hdtv|dvdrip|x26[45]|h[\s._]?26[45]|hevc|avc|aac(?:2[\s._]0)?|e?ac3|dts|ddp?[\s._]?[257][\s._]1|[257][\s._]1|10bit|8bit|proper|repack|remux|nf|amzn|dsnp|hmax|atvp)(?=$|[\s._\-\])])/i;

/** "Night.Harbor_2021" → "Night Harbor 2021": separators to spaces, trimmed of stray dashes. */
function spaced(s: string): string {
  return s
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
    .trim();
}

/** A show name without a trailing year or bracketed tag. */
function showName(raw: string): string {
  return spaced(raw.replace(/\[[^\]]*\]/g, " "))
    .replace(/\s*\(?(?:19|20)\d{2}\)?$/, "")
    .replace(/\s*\([^)]*\)$/, (m) => (/^\s*\((?:us|uk|au|nz|ca)\)$/i.test(m) ? m : ""))
    .trim();
}

export function showKeyOf(show: string): string {
  return show.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** A file name or title made readable: no extension, no release tags, no dots for spaces. */
export function cleanTitle(raw: string): string {
  const base = raw.replace(EXT, "");
  const cut = RELEASE.exec(base);
  const kept = cut ? base.slice(0, cut.index) : base;
  const out = spaced(kept.replace(/\[[^\]]*\]/g, " ")).replace(/\s*\(\s*\)$/, "");
  return out || spaced(base) || raw;
}

/** The episode's own name after the S01E11 marker, if the file has one. */
function episodeName(rest: string): string | null {
  const cut = RELEASE.exec(rest);
  const name = spaced((cut ? rest.slice(0, cut.index) : rest).replace(/\[[^\]]*\]/g, " "));
  return name && !/^(?:19|20)\d{2}$/.test(name) ? name : null;
}

/** "Show/Season 2" → { show: "Show", season: 2 }; "Show" → { show: "Show", season: null }. */
function fromFolder(folder: string | null | undefined): { show: string; season: number | null } | null {
  if (!folder) return null;
  const parts = folder.split(/[\\/]/).filter(Boolean);
  let last = parts.at(-1);
  if (!last) return null;
  const season = /^(?:season|series|s)[\s._-]*(\d{1,2})$/i.exec(spaced(last));
  if (season) {
    const up = parts.at(-2);
    return up ? { show: showName(up), season: Number(season[1]) } : null;
  }
  last = showName(last);
  return last ? { show: last, season: null } : null;
}

function make(show: string, season: number, episode: number, name: string | null): Episode | null {
  if (!show || episode < 1 || season < 0) return null;
  const showKey = showKeyOf(show);
  return showKey ? { show, showKey, season, episode, name } : null;
}

/**
 * The series a file belongs to, or null. `folder` is where it was added from
 * (relative to the picked folder), for a file named only "Episode 11".
 */
export function parseEpisode(rawName: string, folder?: string | null): Episode | null {
  const name = rawName.replace(EXT, "");
  const dir = fromFolder(folder);

  // S01E11, S1E5, S01.E05, s01_e05
  const se = /(?:^|[^a-z0-9])s(\d{1,2})[\s._-]?e(\d{1,3})(?![0-9])/i.exec(name);
  if (se) {
    const show = showName(name.slice(0, se.index)) || dir?.show || "";
    return make(show, Number(se[1]), Number(se[2]), episodeName(name.slice(se.index + se[0].length)));
  }

  // 1x11, 01x05: never a resolution (no digit either side, and not 3–4 digits by 3–4 digits).
  const x = /(?:^|[^0-9a-z])(\d{1,2})x(\d{1,3})(?![0-9a-z])/i.exec(name);
  if (x && !/\d{3,4}x\d{3,4}/i.test(x[0])) {
    const show = showName(name.slice(0, x.index)) || dir?.show || "";
    return make(show, Number(x[1]), Number(x[2]), episodeName(name.slice(x.index + x[0].length)));
  }

  // "Episode 11", "Ep 11", "Ep.11", optionally with "Season 2" before it.
  const ep = /(?:^|[^a-z])(?:episode|ep)[\s._-]*(\d{1,3})(?![0-9])/i.exec(name);
  if (ep) {
    const before = name.slice(0, ep.index);
    const season = /(?:^|[^a-z])(?:season|series)[\s._-]*(\d{1,2})(?![0-9])/i.exec(before);
    const showPart = season ? before.slice(0, season.index) : before;
    const show = showName(showPart) || dir?.show || "";
    const s = season ? Number(season[1]) : (dir?.season ?? 1);
    return make(show, s, Number(ep[1]), episodeName(name.slice(ep.index + ep[0].length)));
  }
  return null;
}

/** Where an item came from (the folder it was added from, folder adds only). */
export function episodeOf(item: Pick<MediaItem, "uri" | "source" | "meta">): Episode | null {
  if (item.source === "embed") return null;
  const file = item.source === "local" ? item.uri : (item.uri.split(/[?#]/)[0]?.split("/").at(-1) ?? "");
  return parseEpisode(decodeURIComponentSafe(file), item.meta.folder ?? null);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** How an item is named on screen: the episode line for a series, else its cleaned title. */
export function displayTitle(item: Pick<MediaItem, "uri" | "source" | "meta" | "title">): { title: string; show: string | null; line: string | null } {
  const ep = episodeOf(item);
  if (!ep) return { title: item.source === "embed" ? item.title : cleanTitle(item.title), show: null, line: null };
  return {
    title: ep.name ?? `Episode ${String(ep.episode)}`,
    show: ep.show,
    line: `Season ${String(ep.season)} · Episode ${String(ep.episode)}`,
  };
}

/** The relative folder a picked file sits in, under the picked folder's own name. */
export function folderFor(path: string, root: string): string {
  const dir = path.split("/").slice(0, -1).join("/");
  // The file input's paths already start with the picked folder; File System Access's don't.
  const full = dir === root || dir.startsWith(`${root}/`) ? dir : dir ? `${root}/${dir}` : root;
  return full.slice(0, 200);
}

/**
 * The list `current` plays through: the rest of its show in season and episode
 * order, else the library list. Embeds never join (an iframe takes no keys and
 * never ends), unless it's the current item itself.
 */
export function playOrder(items: readonly MediaItem[], current: MediaItem): MediaItem[] {
  const ep = episodeOf(current);
  if (ep) {
    const show = items
      .map((item) => ({ item, ep: item.id === current.id ? ep : episodeOf(item) }))
      .filter((x): x is { item: MediaItem; ep: Episode } => x.ep !== null && x.ep.showKey === ep.showKey)
      .sort((a, b) => a.ep.season - b.ep.season || a.ep.episode - b.ep.episode || a.item.title.localeCompare(b.item.title));
    if (show.length > 1) return show.map((x) => x.item);
  }
  return items.filter((i) => i.source !== "embed" || i.id === current.id);
}

/** What plays after `current`, in order. */
export function upNext(items: readonly MediaItem[], current: MediaItem): MediaItem[] {
  const order = playOrder(items, current);
  const at = order.findIndex((i) => i.id === current.id);
  return at < 0 ? [] : order.slice(at + 1).filter((i) => i.source !== "embed");
}

/** The seasons of `current`'s show that are in the library, in order (empty when it isn't a series). */
export function seasonsOf(items: readonly MediaItem[], current: MediaItem): number[] {
  const ep = episodeOf(current);
  if (!ep) return [];
  const seasons = new Set<number>();
  for (const item of items) {
    const e = episodeOf(item);
    if (e?.showKey === ep.showKey) seasons.add(e.season);
  }
  return [...seasons].sort((a, b) => a - b);
}

/** The most cards the up-next rail shows for an item outside a series (the library can hold 2000). */
export const RAIL_MAX = 20;

/**
 * The up-next rail's cards: a series shows all its episodes (the Season menu
 * narrows them); anything else shows itself and what plays after it, at most
 * `max`, so a pause never mounts the whole library.
 */
export function railItems(items: readonly MediaItem[], current: MediaItem, max = RAIL_MAX): MediaItem[] {
  const ep = episodeOf(current);
  if (ep) {
    const order = playOrder(items, current);
    if (order.some((i) => i.id !== current.id && episodeOf(i)?.showKey === ep.showKey)) return order;
  }
  return [current, ...upNext(items, current).slice(0, Math.max(0, max - 1))];
}

/** A series in the library, for Media Home's Shows shelf (T73). */
export type Show = {
  showKey: string;
  show: string;
  /** Its episodes in season and episode order. */
  episodes: MediaItem[];
  /** What a click on the show opens: the one after the furthest watched, else the first not watched, else the first. */
  next: MediaItem;
  watched: number;
  /** When any episode was last played or added (ISO), for the shelf's order. */
  lastAt: string;
};

/** Every show with at least two episodes in the library, the most recently touched first. */
export function showsOf(items: readonly MediaItem[]): Show[] {
  const byKey = new Map<string, { show: string; eps: { item: MediaItem; ep: Episode }[] }>();
  for (const item of items) {
    const ep = episodeOf(item);
    if (!ep) continue;
    let s = byKey.get(ep.showKey);
    if (!s) {
      s = { show: ep.show, eps: [] };
      byKey.set(ep.showKey, s);
    }
    s.eps.push({ item, ep });
  }
  const out: Show[] = [];
  for (const [showKey, s] of byKey) {
    if (s.eps.length < 2) continue;
    const episodes = s.eps
      .sort((a, b) => a.ep.season - b.ep.season || a.ep.episode - b.ep.episode || a.item.title.localeCompare(b.item.title))
      .map((x) => x.item);
    const first = episodes[0];
    if (!first) continue;
    const watched = episodes.filter((i) => i.progress?.watched).length;
    const lastAt = episodes.reduce((m, i) => {
      const at = i.progress?.lastPlayedAt ?? i.createdAt;
      return at > m ? at : m;
    }, "");
    // A show begun at season 2 (season 1 never marked) goes on from where it's been watched to.
    const furthest = episodes.findLastIndex((i) => i.progress?.watched === true);
    const after = furthest >= 0 ? episodes[furthest + 1] : undefined;
    const next = after ?? episodes.find((i) => !i.progress?.watched) ?? first;
    out.push({ showKey, show: s.show, episodes, next, watched, lastAt });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.show.localeCompare(b.show));
}

/** One shelf of the Videos tab: the videos added from one folder, or one show's loose episodes. */
export type FolderGroup = { key: string; label: string; items: MediaItem[] };

/** The label of the shelf for loose videos (no folder, no show). */
export const LOOSE_LABEL = "Other videos";

/** "Videos/Night.Harbor.S02.1080p.WEB-DL" → "Night Harbor S02"; "Hometown/Season 1" → "Hometown · Season 1". */
export function folderLabel(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  const name = (raw: string) => {
    const cut = RELEASE.exec(raw);
    return spaced((cut ? raw.slice(0, cut.index) : raw).replace(/\[[^\]]*\]/g, " ")) || spaced(raw) || raw;
  };
  const last = parts.at(-1) ?? folder;
  const up = parts.at(-2);
  return up && /^(?:season|series|s)[\s._-]*\d{1,2}$/i.test(spaced(last)) ? `${name(up)} · ${spaced(last)}` : name(last);
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * The library as the folders it was added from, so a folder of videos stays
 * together. A video with no folder joins its show's shelf when the show has
 * two or more such episodes (as `showsOf` counts a show), else the loose one.
 * Shelves come in library order (the newest add first); inside one, films by
 * name, then episodes in season and episode order.
 */
export function folderGroups(items: readonly MediaItem[]): FolderGroup[] {
  type Row = { item: MediaItem; ep: Episode | null };
  const rows = items.map((item): Row => ({ item, ep: episodeOf(item) }));
  /** Loose episodes per show: one on its own is no shelf. */
  const loose = new Map<string, number>();
  for (const { item, ep } of rows) if (ep && !item.meta.folder) loose.set(ep.showKey, (loose.get(ep.showKey) ?? 0) + 1);
  const groups = new Map<string, { label: string; rows: Row[] }>();
  for (const { item, ep } of rows) {
    const folder = item.meta.folder;
    const shelved = !folder && ep !== null && (loose.get(ep.showKey) ?? 0) > 1;
    const key = folder ? `f:${folder}` : shelved ? `s:${ep.showKey}` : "";
    let group = groups.get(key);
    if (!group) {
      group = { label: folder ? folderLabel(folder) : shelved ? ep.show : LOOSE_LABEL, rows: [] };
      groups.set(key, group);
    }
    group.rows.push({ item, ep });
  }
  const order = (a: Row, b: Row): number => {
    if (!a.ep || !b.ep) return a.ep ? 1 : b.ep ? -1 : byName.compare(a.item.title, b.item.title);
    return a.ep.showKey.localeCompare(b.ep.showKey) || a.ep.season - b.ep.season || a.ep.episode - b.ep.episode || byName.compare(a.item.title, b.item.title);
  };
  return [...groups].map(([key, g]) => ({ key, label: g.label, items: g.rows.sort(order).map((r) => r.item) }));
}

/** The first `limit` videos across the shelves, each with its full count: the last shelf shown may be part of its folder. */
export function pageGroups(groups: readonly FolderGroup[], limit: number): (FolderGroup & { count: number })[] {
  const out: (FolderGroup & { count: number })[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    const items = g.items.slice(0, left);
    left -= items.length;
    out.push({ key: g.key, label: g.label, items, count: g.items.length });
  }
  return out;
}
