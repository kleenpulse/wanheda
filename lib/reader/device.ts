import { OPFS_DIR, type HashRequest, type HashResponse } from "./device-protocol";

// This device's copy of reader files (SPEC V38, local-only): OPFS, one file
// per sha256. Browser only. Every function degrades instead of throwing:
// OPFS can be missing (older browsers, some private windows) or full.

export interface DeviceFiles {
  /** False when this browser has no OPFS (or refuses it here): nothing can be kept on the device. */
  available: boolean;
  /** sha256 → size in bytes. */
  files: ReadonlyMap<string, number>;
}

function supported(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage.getDirectory === "function";
}

async function folder(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!supported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create });
  } catch (error) {
    // NotFoundError: nothing kept yet. Anything else: OPFS refused here.
    if (!create && error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

/** What this device holds. */
export async function listDeviceFiles(): Promise<DeviceFiles> {
  if (!supported()) return { available: false, files: new Map() };
  let dir: FileSystemDirectoryHandle | null;
  try {
    dir = await folder(false);
  } catch {
    return { available: false, files: new Map() };
  }
  const files = new Map<string, number>();
  if (!dir) return { available: true, files };
  const entries = dir as FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
  for await (const entry of entries.values()) {
    if (entry.kind !== "file" || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
    try {
      files.set(entry.name, (await (entry).getFile()).size);
    } catch {
      // Unreadable: treat as absent.
    }
  }
  return { available: true, files };
}

/**
 * The file kept under a hash, or null. A copy whose size isn't the size the
 * library records was cut short while being written: it is removed, so the
 * entry reads as "not on this device" and the next open writes it again.
 */
export async function readDeviceFile(sha256: string, size: number): Promise<File | null> {
  try {
    const dir = await folder(false);
    if (!dir) return null;
    const file = await (await dir.getFileHandle(sha256)).getFile();
    if (file.size === size) return file;
    await dir.removeEntry(sha256).catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

/** Forgets this device's copy. Missing is fine. */
export async function removeDeviceFile(sha256: string): Promise<void> {
  try {
    const dir = await folder(false);
    await dir?.removeEntry(sha256);
  } catch {
    // Already gone, or OPFS refused: nothing to clean.
  }
}

/** Asks the browser not to evict the reader's files under storage pressure. Best effort. */
export function askToPersist(): void {
  if (!supported() || typeof navigator.storage.persist !== "function") return;
  void navigator.storage.persisted().then((yes) => (yes ? true : navigator.storage.persist())).catch(() => false);
}

let worker: { w: Worker; next: number; waiting: Map<number, (r: HashResponse) => void> } | null = null;

/**
 * Hashes a file in the worker (V39) and, with `keep`, writes it into OPFS in
 * the same pass. If the worker dies, every call waiting on it fails and the
 * next one starts a fresh worker.
 */
export function hashFile(file: File, keep: boolean, expect?: string): Promise<HashResponse> {
  if (!worker) {
    const w = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module", name: "reader-hash" });
    const waiting = new Map<number, (r: HashResponse) => void>();
    w.onmessage = (e: MessageEvent<HashResponse>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data);
    };
    w.onerror = () => {
      for (const [id, done] of waiting) done({ id, ok: false });
      waiting.clear();
      w.terminate();
      if (worker?.w === w) worker = null;
    };
    worker = { w, next: 1, waiting };
  }
  const current = worker;
  const id = current.next++;
  return new Promise((resolve) => {
    current.waiting.set(id, resolve);
    current.w.postMessage({ id, file, keep, ...(expect === undefined ? {} : { expect }) } satisfies HashRequest);
  });
}
