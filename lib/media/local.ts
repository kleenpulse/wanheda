// Where a local media file lives on this device (V54). Bytes are never
// copied: a 4 GB video stays where it is. With File System Access the file's
// handle is kept in IndexedDB (`wanheda-media`, per device), so the file opens
// again after a reload once permission is granted; a file from a plain
// <input> is only known to this tab.

import Dexie, { type EntityTable } from "dexie";
import { desktopFileUrl, desktopFiles, type DesktopRoot } from "@/lib/platform/desktop";
import type { Track } from "./library";
import type { TrackStat } from "./stats";

type HandleRow = { fp: string; handle: FileSystemFileHandle; name: string; size: number };

/**
 * A file in one of the desktop app's native folders (V72), read through its
 * `wanheda-file:` URL with Range requests: never copied, never read whole.
 */
export type NativeFile = { url: string; name: string; size: number; type: string; rootId: string; path: string };

/** Where a native file is, by fp: the desktop's answer to a kept handle, with no permission to lose. */
type NativeRow = { fp: string; rootId: string; path: string; name: string; size: number };

/** Where an item was left on this device (V55). `pending` = 1 until the server has it. */
export type ProgressRow = { itemId: string; positionS: number; watched: boolean; at: number; pending: 0 | 1 };

/** The picked music folder (V58): its handle survives reloads; permission may need a click. */
export type FolderRow = { key: "music"; handle: FileSystemDirectoryHandle; name: string };

/** A file in the music folder that wouldn't parse: not read again until its size or mtime changes. */
export type SkippedRow = { path: string; size: number; lastModified: number };

type MediaDb = Dexie & {
  handles: EntityTable<HandleRow, "fp">;
  progress: EntityTable<ProgressRow, "itemId">;
  tracks: EntityTable<Track, "path">;
  folders: EntityTable<FolderRow, "key">;
  skipped: EntityTable<SkippedRow, "path">;
  trackStats: EntityTable<TrackStat, "path">;
  nativeFiles: EntityTable<NativeRow, "fp">;
};

let dbPromise: Promise<MediaDb | null> | null = null;

export function db(): Promise<MediaDb | null> {
  dbPromise ??= (async () => {
    if (typeof indexedDB === "undefined") return null;
    const d = new Dexie("wanheda-media") as MediaDb;
    d.version(1).stores({ handles: "fp" });
    d.version(2).stores({ handles: "fp", progress: "itemId, pending" });
    // The music index is per device (FRD §8): never on the server.
    d.version(3).stores({ handles: "fp", progress: "itemId, pending", tracks: "path", folders: "key" });
    d.version(4).stores({ handles: "fp", progress: "itemId, pending", tracks: "path", folders: "key", skipped: "path" });
    // Play history (V66): per device, like the index it counts.
    d.version(5).stores({ handles: "fp", progress: "itemId, pending", tracks: "path", folders: "key", skipped: "path", trackStats: "path, lastPlayedAt" });
    // The desktop app's native video files (V72), by fp.
    d.version(6).stores({ handles: "fp", progress: "itemId, pending", tracks: "path", folders: "key", skipped: "path", trackStats: "path, lastPlayedAt", nativeFiles: "fp" });
    await d.open();
    return d;
  })().catch(() => null);
  return dbPromise;
}

/** This tab's files by fp: every pick lands here, FSA or not. */
const sessionFiles = new Map<string, File>();

export function rememberFile(fp: string, file: File): void {
  sessionFiles.set(fp, file);
}

export function forgetFile(fp: string): void {
  sessionFiles.delete(fp);
  void db().then((d) => d?.handles.delete(fp));
}

const VIDEO_TYPES: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mov: "video/quicktime",
  ts: "video/mp2t",
  m2ts: "video/mp2t",
  mts: "video/mp2t",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
};

/** A native folder file by its root and path in it. */
export function nativeFile(rootId: string, path: string, size: number): NativeFile {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return { url: desktopFileUrl(rootId, path), name, size, type: VIDEO_TYPES[ext] ?? "", rootId, path };
}

/** This tab's native files by fp. */
const sessionNative = new Map<string, NativeFile>();

/** Remembers where a native file is: in this tab always, on the device unless it's demo (which writes nothing). */
export async function keepNative(fp: string, file: NativeFile, persist: boolean): Promise<void> {
  sessionNative.set(fp, file);
  if (!persist) return;
  const d = await db();
  await d?.nativeFiles.put({ fp, rootId: file.rootId, path: file.path, name: file.name, size: file.size }).catch(() => undefined);
}

export async function keepHandle(fp: string, handle: FileSystemFileHandle, file: File): Promise<void> {
  const d = await db();
  await d?.handles.put({ fp, handle, name: file.name, size: file.size }).catch(() => undefined);
}

export type Located =
  | { kind: "file"; file: File }
  /** In one of the desktop app's native folders (V72): played from its URL. */
  | { kind: "native"; file: NativeFile }
  /** A handle is kept but needs a click to grant read permission again. */
  | { kind: "permission"; name: string }
  | { kind: "missing" };

type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
};

/** Finds an item's file on this device without prompting. */
export async function locate(fp: string): Promise<Located> {
  const inTab = sessionFiles.get(fp);
  if (inTab) return { kind: "file", file: inTab };
  const native = sessionNative.get(fp) ?? (await nativeRow(fp));
  if (native) return (await reachable(native)) ? { kind: "native", file: native } : { kind: "missing" };
  const row = await (await db())?.handles.get(fp).catch(() => undefined);
  if (!row) return { kind: "missing" };
  const h = row.handle as PermissionHandle;
  const state = (await h.queryPermission?.({ mode: "read" }).catch(() => "denied" as const)) ?? "granted";
  if (state !== "granted") return { kind: "permission", name: row.name };
  try {
    const file = await h.getFile();
    sessionFiles.set(fp, file);
    return { kind: "file", file };
  } catch {
    // Moved or deleted since: the handle is stale.
    return { kind: "missing" };
  }
}

async function nativeRow(fp: string): Promise<NativeFile | null> {
  if (!desktopFiles()) return null;
  const row = await (await db())?.nativeFiles.get(fp).catch(() => undefined);
  return row ? nativeFile(row.rootId, row.path, row.size) : null;
}

/** Whether a native file is still there (a drive unplugged, a file moved or deleted: not). */
async function reachable(file: NativeFile): Promise<boolean> {
  const res = await fetch(file.url, { method: "HEAD" }).catch(() => null);
  return res?.ok === true;
}

/** Every video in a native videos folder (the shell lists it), in name order, at most FOLDER_MAX. */
export async function videosInNative(root: DesktopRoot): Promise<FolderVideo[]> {
  const files = desktopFiles();
  if (!files) return [];
  const { files: listed } = await files.list(root.id);
  return orderFolderVideos(listed.filter((f) => isVideoName(f.path)).map((f) => ({ path: f.path, file: nativeFile(root.id, f.path, f.size), handle: null })));
}

/** Asks again for a kept handle (needs a click). */
export async function regrant(fp: string): Promise<File | null> {
  const row = await (await db())?.handles.get(fp).catch(() => undefined);
  if (!row) return null;
  const h = row.handle as PermissionHandle;
  const state = (await h.requestPermission?.({ mode: "read" }).catch(() => "denied" as const)) ?? "granted";
  if (state !== "granted") return null;
  try {
    const file = await h.getFile();
    sessionFiles.set(fp, file);
    return file;
  } catch {
    return null;
  }
}

export const VIDEO_ACCEPT = ".mp4,.m4v,.mkv,.webm,.mov,.ts,.m2ts,.mts,.ogv,.avi";
export const AUDIO_ACCEPT = ".mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus";

type Picker = (o: {
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}) => Promise<FileSystemFileHandle[]>;

/** The FSA picker, or null where the browser has none (the caller falls back to an <input>). */
export function fsaPicker(): Picker | null {
  const w = globalThis as unknown as { showOpenFilePicker?: Picker };
  return typeof w.showOpenFilePicker === "function" ? w.showOpenFilePicker.bind(globalThis) : null;
}

const VIDEO_EXTENSIONS = new Set(VIDEO_ACCEPT.split(",").map((e) => e.slice(1)));

/** A video by its name, for a folder pick (audio belongs to Music's own folder). */
export function isVideoName(name: string): boolean {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(ext);
}

/** Most files one folder pick adds: a pick of a whole drive shouldn't flood the library. */
export const FOLDER_MAX = 500;
/** Where the walk stops looking, so a huge tree can't hang the pick; name order is taken from what was found. */
const WALK_MAX = 5000;

/** A video found in a picked folder: its path inside it, and its handle when File System Access gave one. */
export type FolderVideo = { path: string; file: File | NativeFile; handle: FileSystemFileHandle | null };

const byPath = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Name order, numbers counted ("Ep 2" before "Ep 10"), capped at FOLDER_MAX. */
export function orderFolderVideos(found: readonly FolderVideo[]): FolderVideo[] {
  return [...found].sort((a, b) => byPath.compare(a.path, b.path)).slice(0, FOLDER_MAX);
}

type DirLike = FileSystemDirectoryHandle & { values: () => AsyncIterable<FileSystemHandle> };

/** Every video under a picked folder, sub-folders too (hidden and unreadable ones skipped), in name order. */
export async function videosInFolder(dir: FileSystemDirectoryHandle): Promise<FolderVideo[]> {
  const out: FolderVideo[] = [];
  const walk = async (d: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    for await (const entry of (d as DirLike).values()) {
      if (out.length >= WALK_MAX) return;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        // A sub-folder the browser won't read (Windows' System Volume Information and the like) is
        // skipped and the rest goes on; the picked folder itself failing still rejects.
        if (!entry.name.startsWith(".")) await walk(entry, path).catch(() => undefined);
      } else if (isVideoName(entry.name)) {
        const file = await entry.getFile().catch(() => null);
        if (file) out.push({ path, file, handle: entry });
      }
    }
  };
  await walk(dir, "");
  return orderFolderVideos(out);
}

/** A plain folder input's videos (no handles: this tab only), in name order. */
export function videosInFiles(files: readonly File[]): FolderVideo[] {
  return orderFolderVideos(
    files
      // The sub-folders between the picked one and the file: hidden ones are skipped, as in the walk.
      .filter((f) => isVideoName(f.name) && !f.webkitRelativePath.split("/").slice(1, -1).some((part) => part.startsWith(".")))
      .map((file) => ({ path: file.webkitRelativePath || file.name, file, handle: null })),
  );
}

type DirPicker = (o?: { mode?: "read"; id?: string }) => Promise<FileSystemDirectoryHandle>;

/** The FSA folder picker, or null (the caller falls back to a folder <input>). */
export function fsaFolderPicker(): DirPicker | null {
  const w = globalThis as unknown as { showDirectoryPicker?: DirPicker };
  return typeof w.showDirectoryPicker === "function" ? w.showDirectoryPicker.bind(globalThis) : null;
}

export const PICKER_TYPES = [
  {
    description: "Video and audio",
    accept: {
      "video/*": VIDEO_ACCEPT.split(","),
      "audio/*": AUDIO_ACCEPT.split(","),
    },
  },
];
