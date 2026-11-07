// The music scan worker (V58): walks the picked folder, parses tags with
// `music-metadata` only for files that are new or changed (by path, size and
// mtime), and stores each distinct cover once in OPFS as WebP, keyed by the
// picture's sha256. A file that won't parse is skipped and counted; the scan
// goes on. Nothing here touches the main thread's time.

import { parseBlob } from "music-metadata";
import { diffScan, isAudioPath, relativeMusicPath, trackFrom, type SeenFile, type Track } from "./library";
import { COVERS_DIR, type MusicRequest, type MusicResponse, type ScanSource, type Stamped } from "./music-protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MusicRequest>) => void) | null;
  postMessage: (message: MusicResponse) => void;
};

const BATCH = 100;
const BATCH_MS = 400;
const COVER_PX = 512;

const cancelled = new Set<number>();
const post = (m: MusicResponse) => {
  scope.postMessage(m);
};

type DirLike = FileSystemDirectoryHandle & { values: () => AsyncIterable<FileSystemHandle> };

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: { seen: SeenFile; get: () => Promise<File> }[], id: number): Promise<void> {
  for await (const entry of (dir as DirLike).values()) {
    if (cancelled.has(id)) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      if (!entry.name.startsWith(".")) await walk(entry, path, out, id);
    } else if (isAudioPath(entry.name)) {
      const file = await entry.getFile().catch(() => null);
      if (file) out.push({ seen: { path, size: file.size, lastModified: file.lastModified }, get: () => Promise.resolve(file) });
    }
  }
}

async function list(source: ScanSource, id: number) {
  const out: { seen: SeenFile; get: () => Promise<File> }[] = [];
  if (source.kind === "dir") await walk(source.handle, "", out, id);
  else {
    for (const file of source.files) {
      const rel = relativeMusicPath(file);
      if (isAudioPath(rel)) out.push({ seen: { path: rel, size: file.size, lastModified: file.lastModified }, get: () => Promise.resolve(file) });
    }
  }
  return out;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const storedCovers = new Set<string>();

/** Keeps one WebP per distinct picture; returns its key, or null when there's none or it won't decode. */
async function keepCover(picture: { data: Uint8Array; format: string } | undefined): Promise<string | null> {
  if (!picture || picture.data.length === 0) return null;
  const bytes = new Uint8Array(picture.data);
  const key = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (storedCovers.has(key)) return key;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(COVERS_DIR, { create: true });
    const name = `${key}.webp`;
    const exists = await dir.getFileHandle(name).then(
      () => true,
      () => false,
    );
    if (!exists) {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: picture.format || "image/jpeg" }));
      const scale = Math.min(1, COVER_PX / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const webp = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
      const handle = await dir.getFileHandle(name, { create: true });
      const w = await handle.createWritable();
      await w.write(webp);
      await w.close();
    }
    storedCovers.add(key);
    return key;
  } catch {
    // No OPFS or an undecodable picture: the track just has no cover.
    return null;
  }
}

async function scan(m: Extract<MusicRequest, { type: "scan" }>): Promise<void> {
  const { id } = m;
  try {
    const files = await list(m.source, id);
    if (cancelled.has(id)) return;
    const stamps = (rows: Stamped[]) => new Map(rows.map(([path, size, lastModified]) => [path, { size, lastModified }]));
    const { parse, keep, removed, stillBad } = diffScan(
      stamps(m.known),
      files.map((f) => f.seen),
      stamps(m.skipped),
    );
    const skipped: Stamped[] = stillBad.map((f) => [f.path, f.size, f.lastModified]);
    const getters = new Map(files.map((f) => [f.seen.path, f.get]));
    let parsed = 0;
    let bad = 0;
    let batch: Track[] = [];
    let flushedAt = Date.now();
    const flush = () => {
      if (batch.length > 0) post({ type: "batch", id, tracks: batch });
      batch = [];
      flushedAt = Date.now();
      post({ type: "progress", id, seen: files.length, toParse: parse.length, parsed, bad });
    };
    post({ type: "progress", id, seen: files.length, toParse: parse.length, parsed, bad });

    for (const f of parse) {
      if (cancelled.has(id)) return;
      try {
        const file = await getters.get(f.path)?.();
        if (!file) throw new Error("gone");
        // Durations come from the headers (`duration: false`): no full decode (T60: 13 ms a track).
        const meta = await parseBlob(file, { duration: false, skipCovers: false });
        // music-metadata doesn't throw on every non-audio file: no container and no codec means it isn't one.
        if (!meta.format.container && !meta.format.codec) throw new Error("not audio");
        const coverKey = await keepCover(meta.common.picture?.[0]);
        batch.push(
          trackFrom(
            f.path,
            f,
            {
              title: meta.common.title,
              artist: meta.common.artist,
              albumartist: meta.common.albumartist,
              album: meta.common.album,
              genre: meta.common.genre,
              year: meta.common.year,
              track: meta.common.track,
              disk: meta.common.disk,
              duration: meta.format.duration,
            },
            coverKey,
          ),
        );
        parsed++;
      } catch {
        bad++;
        skipped.push([f.path, f.size, f.lastModified]);
      }
      if (batch.length >= BATCH || Date.now() - flushedAt > BATCH_MS) flush();
    }
    flush();
    post({ type: "done", id, removed, parsed, kept: keep, bad, skipped });
  } catch (e) {
    if (!cancelled.has(id)) post({ type: "failed", id, message: e instanceof Error ? e.message : String(e) });
  } finally {
    cancelled.delete(id);
  }
}

scope.onmessage = (event) => {
  const m = event.data;
  if (m.type === "cancel") cancelled.add(m.id);
  else void scan(m);
};
