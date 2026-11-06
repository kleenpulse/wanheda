import { OPFS_DIR, toHex, type HashRequest, type HashResponse, type StoreError } from "./device-protocol";

// The reader's file worker (SPEC V39): a picked file's sha256 is worked out
// here, off the main thread, and the bytes are written into this device's
// OPFS under that hash in the same pass. Nothing here talks to the network;
// file bytes never leave the device in local-only mode (V38).

// The worker's own global, typed by hand: the project's DOM lib and the webworker lib can't both load.
interface SyncHandle {
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
type WorkerFileHandle = FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<SyncHandle> };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage: (message: HashResponse) => void;
};

function storeError(error: unknown): StoreError {
  return error instanceof DOMException && error.name === "QuotaExceededError" ? "quota" : "failed";
}

async function store(sha256: string, bytes: Uint8Array): Promise<StoreError | null> {
  let dir: FileSystemDirectoryHandle;
  try {
    const root = await navigator.storage.getDirectory();
    dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch {
    return "unavailable";
  }
  try {
    const existing = await dir.getFileHandle(sha256).then(
      (h) => h.getFile(),
      () => null,
    );
    // Same name means same bytes, unless an earlier write was cut short.
    if (existing?.size === bytes.byteLength) return null;
  } catch {
    // Fall through and write it fresh.
  }
  try {
    const handle = (await dir.getFileHandle(sha256, { create: true })) as WorkerFileHandle;
    if (handle.createSyncAccessHandle) {
      const sync = await handle.createSyncAccessHandle();
      try {
        sync.truncate(0);
        sync.write(bytes, { at: 0 });
        sync.flush();
      } finally {
        sync.close();
      }
    } else {
      const writable = await handle.createWritable();
      await writable.write(bytes as Uint8Array<ArrayBuffer>);
      await writable.close();
    }
    return null;
  } catch (error) {
    // A half-written file must not pass for the real one later.
    await dir.removeEntry(sha256).catch(() => undefined);
    return storeError(error);
  }
}

scope.onmessage = (event) => {
  const { id, file, keep, expect } = event.data;
  void (async () => {
    try {
      const buffer = await file.arrayBuffer();
      const sha256 = toHex(await crypto.subtle.digest("SHA-256", buffer));
      const wanted = keep && (expect === undefined || expect === sha256);
      const error = wanted ? await store(sha256, new Uint8Array(buffer)) : null;
      scope.postMessage({ id, ok: true, sha256, size: buffer.byteLength, stored: wanted && error === null, storeError: error });
    } catch {
      scope.postMessage({ id, ok: false });
    }
  })();
};
