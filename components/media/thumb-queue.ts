"use client";

import { locate } from "@/lib/media/local";
import { THUMBS_DIR, opfsImageUrl, removeOpfsImage, thumbKey, writeOpfsImage } from "@/lib/media/opfs-image";
import type { MediaItem } from "@/lib/media/types";
import { parseMediaUrl } from "@/lib/media/url";
import { usePlayer } from "./player-store";

// Thumbnails for the library (T72, V65), made on this device and kept there
// (OPFS); a local file's bytes never leave it (V54).
//
// - A local file: a short-lived media worker per job (open, one frame, close),
//   one job at a time, when the browser is idle, and never while a video plays
//   (two decoders at once make a 4K picture stutter). Only files this device
//   can read without asking (locate() finds them); it never prompts.
// - A YouTube link: one fetch of its still from i.ytimg.com, with no cookies
//   and no referrer, saved here; tried once, whatever the answer, so Google is
//   never asked about it again.
// - Anything else (other providers, direct links) keeps the tinted tile.

const TRIED_KEY = "wanheda-thumbs-tried";
/** Retry a busy queue after this long. */
const BUSY_RETRY_MS = 3000;

const queue = new Map<string, MediaItem>();
/** Local files whose frame couldn't be read this tab: not tried again until a reload. */
const failed = new Set<string>();
/** Local files this device couldn't find without asking: not looked for again until they're opened (`retryThumb`). */
const notLocated = new Set<string>();
/** Frames being grabbed outside the queue (a single file's add): the queue leaves them alone. */
const pending = new Set<string>();
let running = false;

/** Read fresh each time: it can change while a fetch is out. */
const online = (): boolean => navigator.onLine;

function playing(): boolean {
  const el = usePlayer.getState().el;
  return el !== null && !el.paused;
}

function whenIdle(fn: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 200);
}

function tried(): Set<string> {
  try {
    const raw = localStorage.getItem(TRIED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeTried(all: Set<string>): void {
  try {
    localStorage.setItem(TRIED_KEY, JSON.stringify([...all].slice(-2000)));
  } catch {
    // Full or private: this tab only.
  }
}

function markTried(fp: string): void {
  const all = tried();
  all.add(fp);
  writeTried(all);
}

function untry(fp: string): void {
  const all = tried();
  if (all.delete(fp)) writeTried(all);
}

/** Whether this item can ever get a picture (so a card doesn't queue what never will). */
export function canThumb(item: MediaItem): boolean {
  if (item.kind !== "video") return false;
  if (item.source === "local") return true;
  if (item.source !== "embed") return false;
  const p = parseMediaUrl(item.uri);
  return p.kind === "embed" && p.provider === "youtube";
}

/**
 * A single file's frame is being grabbed on its add engine (use-media.ts): the queue
 * skips the fp until `done`, so two workers never decode one file.
 */
export function grabbingThumb(fp: string): () => void {
  pending.add(fp);
  return () => {
    pending.delete(fp);
  };
}

/** Saves a frame grabbed elsewhere (the add-a-file engine) as the item's thumbnail. */
export async function saveThumb(fp: string, blob: Blob): Promise<void> {
  await writeOpfsImage(THUMBS_DIR, await thumbKey(fp), blob);
}

/** Removes a removed item's thumbnail: no orphans in OPFS, and a re-added link is fetched again. */
export async function dropThumb(fp: string): Promise<void> {
  untry(fp);
  await removeOpfsImage(THUMBS_DIR, await thumbKey(fp));
}

/** The file is on this device again (opened, or its permission granted): it may be looked for once more. */
export function retryThumb(fp: string): void {
  notLocated.delete(fp);
  failed.delete(fp);
}

/** Asks for the item's picture when it has none; cheap to call often (deduplicated, idle, one at a time). */
export function wantThumb(item: MediaItem): void {
  if (!canThumb(item) || queue.has(item.id) || failed.has(item.fp) || notLocated.has(item.fp) || pending.has(item.fp)) return;
  queue.set(item.id, item);
  if (!running) {
    running = true;
    whenIdle(() => void run());
  }
}

async function run(): Promise<void> {
  while (queue.size > 0) {
    if (playing()) {
      // Never alongside a playing video: look again in a while.
      setTimeout(() => {
        whenIdle(() => void run());
      }, BUSY_RETRY_MS);
      return;
    }
    const next = queue.entries().next().value;
    if (!next) break;
    const [id, item] = next;
    await make(item).catch(() => undefined);
    queue.delete(id);
  }
  running = false;
}

async function make(item: MediaItem): Promise<void> {
  const key = await thumbKey(item.fp);
  if (pending.has(item.fp) || (await opfsImageUrl(THUMBS_DIR, key))) return;
  if (item.source === "local") {
    const found = await locate(item.fp);
    if (found.kind !== "file") {
      notLocated.add(item.fp);
      return;
    }
    const { MediaEngine } = await import("@/lib/platform/media");
    const engine = new MediaEngine();
    try {
      await engine.open(found.file);
      const blob = await engine.thumb();
      if (blob) await writeOpfsImage(THUMBS_DIR, key, blob);
      else failed.add(item.fp);
    } catch {
      failed.add(item.fp);
    } finally {
      engine.close();
    }
    return;
  }
  const p = parseMediaUrl(item.uri);
  if (p.kind !== "embed" || p.provider !== "youtube" || tried().has(item.fp)) return;
  // Offline: nothing was asked, so nothing is marked; it's tried when the device is back.
  if (!online()) return;
  let res: Response;
  try {
    res = await fetch(`https://i.ytimg.com/vi/${encodeURIComponent(p.id)}/mqdefault.jpg`, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    // Refused (CORS) while online: the tinted tile stays, and it isn't asked again. A drop
    // in the network mid-fetch looks the same, so only mark it while still online.
    if (online()) markTried(item.fp);
    return;
  }
  // YouTube answered: asked once, whatever the answer.
  markTried(item.fp);
  if (!res.ok) return;
  const blob = await res.blob();
  if (blob.type.startsWith("image/")) await writeOpfsImage(THUMBS_DIR, key, blob);
}
