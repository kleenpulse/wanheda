import Dexie, { type Table } from "dexie";
import type { ProgressWrite, ReaderPayload } from "./reader";

/*
  The reader's device store (SPEC V41, V24): reading positions not yet on the
  server, and the last library the server sent, so /reader and "Continue
  reading" paint on a cold start with no connection. One position per
  document: a position only ever replaces an older one, so the queue is a
  map, not a log, and a replay is harmless (the server keeps the newer `at`).
  IndexedDB through Dexie for the owner; memory for demo, tests and browsers
  without IndexedDB.
*/

export interface ReaderLocalStore {
  /** Queues a position unless the queue holds a newer one for that document. */
  put(w: ProgressWrite): Promise<void>;
  pending(): Promise<ProgressWrite[]>;
  /** The server answered this write: drop it, unless a newer one was queued since. */
  settle(w: ProgressWrite): Promise<void>;
  loadSnapshot(): Promise<ReaderPayload | null>;
  saveSnapshot(p: ReaderPayload): Promise<void>;
}

export class MemoryReaderStore implements ReaderLocalStore {
  readonly #queue = new Map<string, ProgressWrite>();
  #snapshot: ReaderPayload | null = null;

  put(w: ProgressWrite): Promise<void> {
    const held = this.#queue.get(w.documentId);
    if (!held || w.at > held.at) this.#queue.set(w.documentId, w);
    return Promise.resolve();
  }

  pending(): Promise<ProgressWrite[]> {
    return Promise.resolve([...this.#queue.values()]);
  }

  settle(w: ProgressWrite): Promise<void> {
    if (this.#queue.get(w.documentId)?.at === w.at) this.#queue.delete(w.documentId);
    return Promise.resolve();
  }

  loadSnapshot(): Promise<ReaderPayload | null> {
    return Promise.resolve(this.#snapshot);
  }

  saveSnapshot(p: ReaderPayload): Promise<void> {
    this.#snapshot = p;
    return Promise.resolve();
  }
}

interface MetaRow {
  key: "library";
  value: ReaderPayload;
}

type ReaderDb = Dexie & {
  progress: Table<ProgressWrite, string>;
  meta: Table<MetaRow, MetaRow["key"]>;
};

class DexieReaderStore implements ReaderLocalStore {
  readonly #db: ReaderDb;

  constructor(db: ReaderDb) {
    this.#db = db;
  }

  put(w: ProgressWrite): Promise<void> {
    const db = this.#db;
    return db.transaction("rw", db.progress, async () => {
      const held = await db.progress.get(w.documentId);
      if (!held || w.at > held.at) await db.progress.put(w);
    });
  }

  pending(): Promise<ProgressWrite[]> {
    return this.#db.progress.toArray();
  }

  settle(w: ProgressWrite): Promise<void> {
    const db = this.#db;
    return db.transaction("rw", db.progress, async () => {
      if ((await db.progress.get(w.documentId))?.at === w.at) await db.progress.delete(w.documentId);
    });
  }

  async loadSnapshot(): Promise<ReaderPayload | null> {
    return (await this.#db.meta.get("library"))?.value ?? null;
  }

  async saveSnapshot(p: ReaderPayload): Promise<void> {
    await this.#db.meta.put({ key: "library", value: p });
  }
}

/** Opens the device store. Rejects where IndexedDB is unavailable; the caller falls back to memory. */
export async function openReaderStore(): Promise<ReaderLocalStore> {
  const db = new Dexie("wanheda-reader") as ReaderDb;
  db.version(1).stores({ progress: "documentId", meta: "key" });
  await db.open();
  return new DexieReaderStore(db);
}
