import { createReadStream, readFileSync, renameSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { Readable } from "node:stream";
import { contentType, isInside, isUncPath, MAX_DEPTH, MAX_FILES, parseFileUrl, parseRange, parseRoots, type ListedFile, type Root, type RootKind } from "./files";

/*
 * Native files (SPEC V72), the parts that touch the disk. Every read goes
 * through `resolveInRoot`: the requested path's real path (symlinks and
 * junctions resolved) must be a file inside the root's real path, and a UNC
 * path is only allowed when the root itself is one.
 */

const WINDOWS = process.platform === "win32";

/** The real path of `segments` under the root, if it's a plain file inside it; null otherwise (missing, outside, a folder). */
export async function resolveInRoot(rootPath: string, segments: readonly string[]): Promise<{ path: string; size: number } | null> {
  try {
    const rootReal = await realpath(rootPath);
    const real = await realpath(join(rootReal, ...segments));
    if (isUncPath(real) && !isUncPath(rootReal)) return null;
    if (!isInside(rootReal, real, WINDOWS) || real === rootReal) return null;
    const info = await stat(real);
    return info.isFile() ? { path: real, size: info.size } : null;
  } catch {
    return null;
  }
}

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

/**
 * Answers a `wanheda-file:` request: the file's bytes, or the one range asked
 * for (so audio and video can seek). Anything refused is a plain 404, which
 * says nothing about what exists. A request from another origin (an embed's
 * frame) is refused outright.
 */
export async function serveFile(request: Request, roots: readonly Root[], appOrigin: string | null): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== appOrigin) return NOT_FOUND();
  const parsed = parseFileUrl(request.url);
  const root = parsed ? roots.find((r) => r.id === parsed.rootId) : undefined;
  if (!parsed || !root) return NOT_FOUND();
  const file = await resolveInRoot(root.path, parsed.segments);
  if (!file) return NOT_FOUND();

  const headers: Record<string, string> = {
    "content-type": contentType(file.path),
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    vary: "Origin",
    ...(appOrigin ? { "access-control-allow-origin": appOrigin, "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges" } : {}),
  };
  const range = parseRange(request.headers.get("range"), file.size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${String(file.size)}` } });
  const start = range?.start ?? 0;
  const end = range?.end ?? file.size - 1;
  const length = file.size === 0 ? 0 : end - start + 1;
  headers["content-length"] = String(length);
  if (range) headers["content-range"] = `bytes ${String(start)}-${String(end)}/${String(file.size)}`;
  const status = range ? 206 : 200;
  if (request.method === "HEAD" || length === 0) return new Response(null, { status, headers });
  const body = Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}

const AUDIO = new Set(["mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "wav", "weba"]);
// The web's VIDEO_ACCEPT (lib/media/local.ts), so a native pick finds what a browser pick would.
const VIDEO = new Set(["mp4", "m4v", "mkv", "webm", "mov", "ts", "m2ts", "mts", "ogv", "avi"]);

export function isMediaName(name: string, kind: RootKind): boolean {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return (kind === "music" ? AUDIO : VIDEO).has(ext);
}

/**
 * Every music or video file under the root: sub-folders walked, dot-folders
 * skipped, links (symlinks, junctions) never followed, at most MAX_FILES
 * files and MAX_DEPTH levels. Paths are relative, with forward slashes.
 * Unreadable folders are skipped; `complete` is false if any was, or a cap hit.
 */
export async function listRoot(root: Root): Promise<{ files: ListedFile[]; complete: boolean }> {
  const files: ListedFile[] = [];
  let complete = true;
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) {
      complete = false;
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      complete = false;
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        complete = false;
        return;
      }
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, childRel, depth + 1);
      } else if (entry.isFile() && isMediaName(entry.name, root.kind)) {
        try {
          // lstat: a link that slipped past the dirent check is still not followed.
          const info = await lstat(full);
          if (info.isFile()) files.push({ path: childRel, size: info.size, mtimeMs: Math.round(info.mtimeMs) });
        } catch {
          complete = false;
        }
      }
    }
  };
  try {
    await walk(await realpath(root.path), "", 0);
  } catch {
    return { files: [], complete: false };
  }
  return { files, complete };
}

/** Watches a root (sub-folders too) and calls `onChange` once things settle. Returns a stop function. */
export function watchRoot(root: Root, onChange: () => void, settleMs = 1500): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(root.path, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, settleMs);
    });
    // A folder that goes away (an unplugged drive) stops the watch; the next scan finds it unreachable.
    watcher.on("error", () => watcher?.close());
  } catch {
    // Not watchable now; a manual rescan still works.
  }
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

/** The separator this platform's real paths use, for tests. */
export const PATH_SEP = sep;

function rootsFile(userData: string): string {
  return join(userData, "roots.json");
}

/** The picked folders, kept by main only (V72): the page knows their ids, never reads their paths directly. */
export function loadRoots(userData: string): Root[] {
  try {
    return parseRoots(readFileSync(rootsFile(userData), "utf8"));
  } catch {
    return [];
  }
}

export function saveRoots(userData: string, roots: readonly Root[]): void {
  const path = rootsFile(userData);
  writeFileSync(`${path}.tmp`, `${JSON.stringify(roots, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}
