import { randomBytes } from "node:crypto";

/*
 * Native music and video folders (SPEC V72), pure. The owner picks a folder
 * in a dialog; main keeps it as a root with an unguessable id, and the page
 * reads its files only through `wanheda-file://<root id>/<relative path>`.
 * Every request is checked here: the path must decode to a plain relative
 * path, and (in files-io.ts) its real path must stay inside the root's real
 * path, so `..`, a symlink or junction pointing out, or a UNC path can't
 * reach anything else.
 */

export const FILE_SCHEME = "wanheda-file";

export type RootKind = "music" | "video";

export type Root = { id: string; kind: RootKind; path: string; name: string };

/** Folders kept at most, of each kind. */
export const MAX_ROOTS = 8;

/** A new root id: 128 random bits, so a page can't guess one it wasn't given. */
export function newRootId(): string {
  return randomBytes(16).toString("hex");
}

const ROOT_ID = /^[0-9a-f]{32}$/;

export function isRootId(value: unknown): value is string {
  return typeof value === "string" && ROOT_ID.test(value);
}

/** The roots in roots.json; anything malformed is dropped (never the whole file for one bad entry). */
export function parseRoots(text: string | null): Root[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Root[] = [];
  const seen = new Set<string>();
  for (const r of raw as unknown[]) {
    if (!r || typeof r !== "object") continue;
    const { id, kind, path, name } = r as Record<string, unknown>;
    if (!isRootId(id) || seen.has(id) || (kind !== "music" && kind !== "video") || typeof path !== "string" || path === "" || typeof name !== "string") continue;
    seen.add(id);
    out.push({ id, kind, path, name });
  }
  return out;
}

/** A root's URL for a relative path (forward slashes), each segment encoded. */
export function fileUrl(rootId: string, relPath: string): string {
  return `${FILE_SCHEME}://${rootId}/${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The root id and the relative path's segments in a `wanheda-file:` URL, or
 * null. Refused: another scheme, a bad root id, an empty path, any `.`, `..`
 * or empty segment, a backslash, a colon (drive letters, streams), a NUL, or
 * a segment that decodes to any of those.
 */
export function parseFileUrl(raw: string): { rootId: string; segments: string[] } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${FILE_SCHEME}:` || url.username || url.password || url.port || url.search || url.hash) return null;
  const rootId = url.hostname.toLowerCase();
  if (!isRootId(rootId)) return null;
  // The URL parser resolves dot segments ("/a/../b", "%2e%2e"): refuse any URL whose path it changed.
  const afterScheme = raw.slice(`${FILE_SCHEME}://`.length);
  const slash = afterScheme.indexOf("/");
  const rawPath = slash === -1 ? "" : afterScheme.slice(slash);
  if (rawPath !== url.pathname) return null;
  const parts = url.pathname.split("/").slice(1);
  if (parts.length === 0) return null;
  const segments: string[] = [];
  for (const part of parts) {
    let seg: string;
    try {
      seg = decodeURIComponent(part);
    } catch {
      return null;
    }
    if (seg === "" || seg === "." || seg === ".." || /[\\/:\0]/.test(seg)) return null;
    segments.push(seg);
  }
  return { rootId, segments };
}

/** Whether `child` is `root` itself or inside it, by real paths. Windows paths compare without case. */
export function isInside(root: string, child: string, windows: boolean): boolean {
  const norm = (p: string) => {
    const slashes = windows ? p.replace(/\//g, "\\") : p;
    const trimmed = slashes.replace(windows ? /\\+$/ : /\/+$/, "");
    return windows ? trimmed.toLowerCase() : trimmed;
  };
  const r = norm(root);
  const c = norm(child);
  const sep = windows ? "\\" : "/";
  return c === r || c.startsWith(r + sep);
}

/** Whether a path is a UNC or device path (\\server\share, \\?\, \\.\). */
export function isUncPath(p: string): boolean {
  return /^[\\/]{2}/.test(p);
}

export type ByteRange = { start: number; end: number };

/**
 * One `Range: bytes=…` range against a file of `size` bytes: { start, end }
 * (end inclusive), null for no range (send it all), or "unsatisfiable".
 * Several ranges, or anything malformed, means the whole file.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (size === 0) return "unsatisfiable";
  if (a === "") {
    // The last N bytes.
    const n = Number(b);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return "unsatisfiable";
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return "unsatisfiable";
  return { start, end };
}

const TYPES: Readonly<Record<string, string>> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  ts: "video/mp2t",
  m2ts: "video/mp2t",
  mts: "video/mp2t",
  ogv: "video/ogg",
  srt: "text/plain; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function contentType(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}

/** Files listed per root at most, and how deep the walk goes. */
export const MAX_FILES = 20_000;
export const MAX_DEPTH = 12;

/** A listed file: its path in the root (forward slashes), size and modified time. */
export type ListedFile = { path: string; size: number; mtimeMs: number };
