// Where a local media file lives on this device (V54). Bytes are never
// copied: a 4 GB video stays where it is. With File System Access the file's
// handle is kept in IndexedDB (`wanheda-media`, per device), so the file opens
// again after a reload once permission is granted; a file from a plain
// <input> is only known to this tab.

import Dexie, { type EntityTable } from "dexie";

type HandleRow = { fp: string; handle: FileSystemFileHandle; name: string; size: number };

type MediaDb = Dexie & { handles: EntityTable<HandleRow, "fp"> };

let dbPromise: Promise<MediaDb | null> | null = null;

function db(): Promise<MediaDb | null> {
  dbPromise ??= (async () => {
    if (typeof indexedDB === "undefined") return null;
    const d = new Dexie("wanheda-media") as MediaDb;
    d.version(1).stores({ handles: "fp" });
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

export async function keepHandle(fp: string, handle: FileSystemFileHandle, file: File): Promise<void> {
  const d = await db();
  await d?.handles.put({ fp, handle, name: file.name, size: file.size }).catch(() => undefined);
}

export type Located =
  | { kind: "file"; file: File }
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

export const PICKER_TYPES = [
  {
    description: "Video and audio",
    accept: {
      "video/*": VIDEO_ACCEPT.split(","),
      "audio/*": AUDIO_ACCEPT.split(","),
    },
  },
];
