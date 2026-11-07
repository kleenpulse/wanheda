// The music library (V58), pure parts: what a track row holds, the fallbacks
// for untagged files, the incremental rescan diff, browsing groups and search.
// The scan worker and the client store both use these, so they agree.

export const UNKNOWN_ARTIST = "Unknown artist";
export const UNKNOWN_ALBUM = "Unknown album";
export const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "weba", "aiff", "aif"] as const;

/** One indexed track. `path` is relative to the picked folder, `/`-separated, and unique. */
export type Track = {
  path: string;
  size: number;
  lastModified: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string | null;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  durationS: number | null;
  /** sha256 of the embedded picture: the cover's key in OPFS (one per album, not per track). */
  coverKey: string | null;
  /** Folder part of `path` ("" at the root). */
  folder: string;
};

/** Tags as music-metadata reports them (the parts we keep). */
export type TagInput = {
  title?: string | undefined;
  artist?: string | undefined;
  albumartist?: string | undefined;
  album?: string | undefined;
  genre?: readonly string[] | undefined;
  year?: number | undefined;
  track?: { no: number | null } | undefined;
  disk?: { no: number | null } | undefined;
  duration?: number | undefined;
};

export function isAudioPath(path: string): boolean {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

/** A plain folder input's file, as a library path: webkitRelativePath starts with the picked folder's own name, dropped as the FSA walk does. */
export function relativeMusicPath(file: { name: string; webkitRelativePath: string }): string {
  return file.webkitRelativePath.split("/").slice(1).join("/") || file.name;
}

export function folderOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

function fileTitle(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || name;
}

const clean = (s: string | undefined) => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : null;
};

/** A track row from a file and its tags; no tags ⇒ title from the file name, "Unknown artist" (T60: half the owner's files). */
export function trackFrom(path: string, file: { size: number; lastModified: number }, tags: TagInput, coverKey: string | null): Track {
  const artist = clean(tags.artist) ?? clean(tags.albumartist) ?? UNKNOWN_ARTIST;
  const duration = tags.duration;
  const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
  return {
    path,
    size: file.size,
    lastModified: file.lastModified,
    title: clean(tags.title) ?? fileTitle(path),
    artist,
    album: clean(tags.album) ?? UNKNOWN_ALBUM,
    albumArtist: clean(tags.albumartist) ?? artist,
    genre: clean(tags.genre?.[0]),
    year: num(tags.year),
    trackNo: num(tags.track?.no),
    discNo: num(tags.disk?.no),
    durationS: typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : null,
    coverKey,
    folder: folderOf(path),
  };
}

export type SeenFile = { path: string; size: number; lastModified: number };

/**
 * The incremental rescan (V58): a file is parsed again only when its path is
 * new or its size or mtime changed; paths no longer seen are removed.
 */
type Stamp = { size: number; lastModified: number };

/**
 * What a rescan must read: new or changed files. A file skipped last time
 * (it wouldn't parse) is skipped again while its size and mtime are the same,
 * so a bad file isn't re-read on every load; `stillBad` lists those.
 */
export function diffScan(
  known: ReadonlyMap<string, Stamp>,
  seen: readonly SeenFile[],
  skipped: ReadonlyMap<string, Stamp> = new Map(),
): { parse: SeenFile[]; keep: number; removed: string[]; stillBad: SeenFile[] } {
  const parse: SeenFile[] = [];
  const stillBad: SeenFile[] = [];
  let keep = 0;
  const present = new Set<string>();
  const same = (k: Stamp | undefined, f: SeenFile) => k !== undefined && k.size === f.size && k.lastModified === f.lastModified;
  for (const f of seen) {
    present.add(f.path);
    if (same(known.get(f.path), f)) keep++;
    else if (same(skipped.get(f.path), f)) stillBad.push(f);
    else parse.push(f);
  }
  const removed = [...known.keys()].filter((p) => !present.has(p));
  return { parse, keep, removed, stillBad };
}

export type Browse = "artists" | "albums" | "genres" | "folders" | "songs";
export const BROWSE: readonly Browse[] = ["artists", "albums", "genres", "folders", "songs"];

export type Group = { key: string; label: string; sub: string; count: number; coverKey: string | null; tracks: Track[] };

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Album order: disc, then track number, then title. */
export function albumOrder(a: Track, b: Track): number {
  return (a.discNo ?? 1) - (b.discNo ?? 1) || (a.trackNo ?? 1e6) - (b.trackNo ?? 1e6) || collator.compare(a.title, b.title);
}

export function groupTracks(tracks: readonly Track[], by: Exclude<Browse, "songs">): Group[] {
  const groups = new Map<string, Group>();
  for (const t of tracks) {
    const key =
      by === "artists" ? t.albumArtist : by === "albums" ? `${t.albumArtist}\u0000${t.album}` : by === "genres" ? (t.genre ?? "No genre") : t.folder || "/";
    let g = groups.get(key);
    if (!g) {
      const label = by === "albums" ? t.album : by === "folders" ? t.folder || "Top folder" : key;
      g = { key, label, sub: by === "albums" ? t.albumArtist : "", count: 0, coverKey: null, tracks: [] };
      groups.set(key, g);
    }
    g.count++;
    g.coverKey ??= t.coverKey;
    g.tracks.push(t);
  }
  const out = [...groups.values()];
  for (const g of out) g.tracks.sort(by === "albums" || by === "folders" ? albumOrder : (a, b) => collator.compare(a.album, b.album) || albumOrder(a, b));
  return out.sort((a, b) => collator.compare(a.label, b.label));
}

export function sortSongs(tracks: readonly Track[]): Track[] {
  return [...tracks].sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.artist, b.artist));
}

/** Case- and accent-insensitive search over title, artist, album and genre; every word must match. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Tracks are immutable (a rescan makes new objects), so each one's folded text is worked out once.
const haystacks = new WeakMap<Track, string>();
function haystack(t: Track): string {
  let hay = haystacks.get(t);
  if (hay === undefined) {
    hay = fold(`${t.title} ${t.artist} ${t.album} ${t.albumArtist} ${t.genre ?? ""}`);
    haystacks.set(t, hay);
  }
  return hay;
}

export function searchTracks(tracks: readonly Track[], query: string): Track[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...tracks];
  return tracks.filter((t) => {
    const hay = haystack(t);
    return words.every((w) => hay.includes(w));
  });
}
