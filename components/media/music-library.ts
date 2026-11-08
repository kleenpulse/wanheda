"use client";

import { create } from "zustand";
import { relativeMusicPath, type Track } from "@/lib/media/library";
import { db } from "@/lib/media/local";
import { seedTracks } from "@/lib/media/music-seed";
import { pruneList } from "@/lib/media/stats";
import type { MusicRequest, MusicResponse, ScanSource, Stamped } from "@/lib/media/music-protocol";

// The music library on this device (V58): the folder the owner picked (its
// handle kept in IndexedDB, so a reload needs at most a click to reconnect),
// the track index in Dexie, and scans in a worker. Without File System Access
// a plain folder input works for this tab only. Demo shows generated tones.
// Only a kept folder (FSA, not demo) writes to the device index: a folder
// input or a demo pick lives in this tab and is gone on reload.

export type FolderState =
  | { kind: "none" }
  | { kind: "ready"; name: string }
  /** The handle is kept but the browser wants a click to read it again. */
  | { kind: "reconnect"; name: string }
  /** Picked through a plain input: gone on reload. */
  | { kind: "session"; name: string };

export type ScanState = { id: number; seen: number; toParse: number; parsed: number; bad: number; phase: "scanning" | "done" | "failed"; message?: string };

type PermissionDir = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
};

type State = {
  tracks: Track[] | null;
  folder: FolderState;
  scan: ScanState | null;
  load: (demo: boolean) => void;
  pickFolder: () => Promise<void>;
  pickFiles: (files: File[]) => void;
  reconnect: () => Promise<void>;
  rescan: () => Promise<void>;
  cancel: () => void;
  dismissScan: () => void;
};

let worker: Worker | null = null;
let nextId = 1;
let loaded = false;
let demoMode = false;
/** Whether the current scan writes to Dexie (a kept folder, not demo). */
let persist = false;
/** Files that wouldn't parse, sent with each scan so they aren't read again until they change. */
let skipped: Stamped[] = [];
/** The folder the index came from, in this tab: a kept folder or a demo pick (FSA). */
let liveDir: FileSystemDirectoryHandle | null = null;
/** A plain folder input's files, by library path: this tab only. */
let sessionFiles = new Map<string, File>();

function ensureWorker(onMessage: (m: MusicResponse) => void): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../lib/media/music.worker.ts", import.meta.url), { type: "module", name: "music-scan" });
    worker.onmessage = (e: MessageEvent<MusicResponse>) => {
      onMessage(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault();
      onMessage({ type: "failed", id: useMusicLibrary.getState().scan?.id ?? 0, message: "The scanner stopped." });
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

type DirPicker = (o?: { mode?: "read"; id?: string }) => Promise<FileSystemDirectoryHandle>;

export function hasFolderPicker(): boolean {
  return typeof (globalThis as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker === "function";
}

export const useMusicLibrary = create<State>((set, get) => {
  const handle = (m: MusicResponse) => {
    const scan = get().scan;
    if (!scan || m.id !== scan.id) return;
    if (m.type === "progress") set({ scan: { ...scan, seen: m.seen, toParse: m.toParse, parsed: m.parsed, bad: m.bad } });
    else if (m.type === "batch") {
      const byPath = new Map((get().tracks ?? []).map((t) => [t.path, t]));
      for (const t of m.tracks) byPath.set(t.path, t);
      set({ tracks: [...byPath.values()] });
      if (persist) void db().then((d) => d?.tracks.bulkPut(m.tracks).catch(() => undefined));
    } else if (m.type === "done") {
      skipped = m.skipped;
      // Gone from the folder, or changed and no longer readable: out of the index.
      const gone = new Set([...m.removed, ...m.skipped.map(([path]) => path)]);
      const tracks = get().tracks ?? [];
      const drop = tracks.filter((t) => gone.has(t.path)).map((t) => t.path);
      set({
        tracks: tracks.filter((t) => !gone.has(t.path)),
        scan: { ...scan, parsed: m.parsed, bad: m.bad, phase: "done" },
      });
      if (persist) {
        void db().then(async (d) => {
          if (!d) return;
          if (drop.length > 0) await d.tracks.bulkDelete(drop).catch(() => undefined);
          // The play history lets go of files this completed scan found gone (V66); a failed one keeps it all.
          const forget = pruneList({ phase: "done", kept: true, removed: m.removed, unreadable: m.unreadable });
          if (forget.length > 0) await d.trackStats.bulkDelete(forget).catch(() => undefined);
          await d
            .transaction("rw", d.skipped, async () => {
              await d.skipped.clear();
              await d.skipped.bulkPut(m.skipped.map(([path, size, lastModified]) => ({ path, size, lastModified })));
            })
            .catch(() => undefined);
        });
      }
    } else set({ scan: { ...scan, phase: "failed", message: m.message } });
  };

  const start = (source: ScanSource) => {
    const prev = get().scan;
    if (prev?.phase === "scanning") worker?.postMessage({ type: "cancel", id: prev.id } satisfies MusicRequest);
    const id = nextId++;
    persist = source.kind === "dir" && !demoMode;
    if (source.kind === "dir") {
      liveDir = source.handle;
      sessionFiles = new Map();
    } else {
      liveDir = null;
      sessionFiles = new Map(source.files.map((f) => [relativeMusicPath(f), f]));
    }
    set({ scan: { id, seen: 0, toParse: 0, parsed: 0, bad: 0, phase: "scanning" } });
    const known = (get().tracks ?? []).filter((t) => !t.path.startsWith("tone:")).map((t): Stamped => [t.path, t.size, t.lastModified]);
    ensureWorker(handle).postMessage({ type: "scan", id, source, known, skipped } satisfies MusicRequest);
  };

  const folderRow = async () => (await db())?.folders.get("music").catch(() => undefined);

  return {
    tracks: null,
    folder: { kind: "none" },
    scan: null,

    load: (demo) => {
      if (loaded) return;
      loaded = true;
      demoMode = demo;
      if (demo) {
        set({ tracks: seedTracks() });
        return;
      }
      void (async () => {
        const d = await db();
        const tracks = (await d?.tracks.toArray().catch(() => [])) ?? [];
        skipped = ((await d?.skipped.toArray().catch(() => [])) ?? []).map((r): Stamped => [r.path, r.size, r.lastModified]);
        const row = await folderRow();
        if (!row) {
          set({ tracks, folder: { kind: "none" } });
          return;
        }
        const h = row.handle as PermissionDir;
        const state = (await h.queryPermission?.({ mode: "read" }).catch(() => "denied" as const)) ?? "granted";
        set({ tracks, folder: state === "granted" ? { kind: "ready", name: row.name } : { kind: "reconnect", name: row.name } });
        // Pick up changes since last time, quietly (incremental: only new or changed files are read).
        if (state === "granted") start({ kind: "dir", handle: row.handle });
      })();
    },

    pickFolder: async () => {
      const picker = (globalThis as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;
      if (!picker) return;
      let dir: FileSystemDirectoryHandle;
      try {
        dir = await picker.call(globalThis, { mode: "read", id: "wanheda-music" });
      } catch {
        return; // closed the picker
      }
      if (demoMode) {
        // Demo keeps the pick in this tab only: nothing is written to the device.
        skipped = [];
        set({ tracks: [], folder: { kind: "session", name: dir.name } });
        start({ kind: "dir", handle: dir });
        return;
      }
      const d = await db();
      const before = await folderRow();
      // A different folder: its index replaces the old one.
      if (before && !(await before.handle.isSameEntry(dir).catch(() => false))) {
        await d?.tracks.clear().catch(() => undefined);
        await d?.skipped.clear().catch(() => undefined);
        skipped = [];
        set({ tracks: [] });
      }
      await d?.folders.put({ key: "music", handle: dir, name: dir.name }).catch(() => undefined);
      set({ folder: { kind: "ready", name: dir.name } });
      start({ kind: "dir", handle: dir });
    },

    pickFiles: (files) => {
      if (files.length === 0) return;
      const name = files[0]?.webkitRelativePath.split("/")[0] ?? "Music";
      skipped = [];
      set({ tracks: [], folder: { kind: "session", name } });
      start({ kind: "files", files });
    },

    reconnect: async () => {
      const row = await folderRow();
      if (!row) return;
      const h = row.handle as PermissionDir;
      const state = (await h.requestPermission?.({ mode: "read" }).catch(() => "denied" as const)) ?? "granted";
      if (state !== "granted") return;
      set({ folder: { kind: "ready", name: row.name } });
      start({ kind: "dir", handle: row.handle });
    },

    rescan: async () => {
      const row = await folderRow();
      if (row && get().folder.kind === "ready") start({ kind: "dir", handle: row.handle });
    },

    cancel: () => {
      const scan = get().scan;
      if (scan?.phase !== "scanning") return;
      worker?.postMessage({ type: "cancel", id: scan.id } satisfies MusicRequest);
      set({ scan: null });
    },

    dismissScan: () => {
      if (get().scan?.phase !== "scanning") set({ scan: null });
    },
  };
});

/** The folder can't be read (gone, or permission refused): no track in it will play. */
export class FolderAccessError extends Error {}

/**
 * The file behind a library path, for the player (T64). A kept folder that
 * needs permission again asks for it here: the caller is a click to play.
 */
export async function musicFile(path: string): Promise<File> {
  const inTab = sessionFiles.get(path);
  if (inTab) return inTab;
  let dir = liveDir;
  if (!dir) {
    const row = await (await db())?.folders.get("music").catch(() => undefined);
    if (!row) throw new FolderAccessError("Pick your music folder again to play this.");
    const h = row.handle as PermissionDir;
    let state = (await h.queryPermission?.({ mode: "read" }).catch(() => "denied" as const)) ?? "granted";
    if (state !== "granted") state = (await h.requestPermission?.({ mode: "read" }).catch(() => "denied" as const)) ?? "denied";
    if (state !== "granted") throw new FolderAccessError(`Reconnect ${row.name} to play from it.`);
    useMusicLibrary.setState({ folder: { kind: "ready", name: row.name } });
    dir = liveDir = row.handle;
  }
  try {
    const parts = path.split("/");
    const name = parts.pop() ?? path;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    throw new Error("It isn't in the music folder any more. Rescan to tidy the list.");
  }
}

/** Whether the library is demo's (tones, or a pick kept in this tab only). */
export function libraryIsDemo(): boolean {
  return demoMode;
}

/** Whether play history is kept on this device: only for a kept folder, never demo or a tab-only pick (V66). */
export function keepsHistory(): boolean {
  const kind = useMusicLibrary.getState().folder.kind;
  return !demoMode && (kind === "ready" || kind === "reconnect");
}
