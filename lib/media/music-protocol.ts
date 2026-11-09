// Messages between the page and the music scan worker (music.worker.ts).
// Type-only imports, so the worker bundle carries nothing it doesn't use.

import type { Track } from "./library";

export const COVERS_DIR = "wanheda-covers";

export type ScanSource =
  | { kind: "dir"; handle: FileSystemDirectoryHandle }
  /** A plain `<input webkitdirectory>` pick (no FSA): this tab only. */
  | { kind: "files"; files: File[] }
  /**
   * The desktop app's native music folder (V72): the shell lists it, and each
   * file is read through its `wanheda-file:` URL. `complete` is false when the
   * listing missed something (an unreadable folder, a drive gone): nothing is
   * pruned then.
   */
  | { kind: "native"; rootId: string; files: Stamped[]; complete: boolean };

/** A file as last seen: path, size, mtime. */
export type Stamped = [path: string, size: number, lastModified: number];

export type MusicRequest =
  /** `skipped`: files that wouldn't parse last time; not read again until they change. */
  | { type: "scan"; id: number; source: ScanSource; known: Stamped[]; skipped: Stamped[] }
  | { type: "cancel"; id: number };

export type MusicResponse =
  | { type: "progress"; id: number; seen: number; toParse: number; parsed: number; bad: number }
  | { type: "batch"; id: number; tracks: Track[] }
  /** `skipped`: every file present that won't parse (new and old), replacing the previous list. */
  /** `unreadable`: files listed but not opened (a drive pulled mid-scan); they're in `removed` too, but play history keeps them (V66). */
  | { type: "done"; id: number; removed: string[]; unreadable: string[]; parsed: number; kept: number; bad: number; skipped: Stamped[] }
  | { type: "failed"; id: number; message: string };
