import type { Note, NoteWrite } from "./notes";
import { landed, type NoteStatus, type SendResult } from "./sync";

/*
  The notes outbox (ADR-0008, SPEC V23). Every note write is stored on the
  device first, then sent in order, one at a time, when the device is online:
  on a new write, on focus, on reconnect and on a 30 s tick. Nothing leaves the
  queue until the server has answered, so a closed tab or a dropped connection
  loses nothing; the replay is safe because the server treats a write it
  already holds as a no-op.

  Storage is behind LocalNotesStore: IndexedDB (Dexie) for the owner, memory
  for demo and tests. All tabs of one browser share the IndexedDB queue, and a
  Web Lock lets one tab at a time send from it.
*/

export type DeleteResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "failed" };

interface OpBase {
  /** Queue order, given by the store. */
  seq?: number;
  opId: string;
  noteId: string;
  queuedAt: number;
  /** Sent before with no answer. It may have landed, so it goes again as is before anything built on it. */
  tried: boolean;
}

export type SaveOp = OpBase & { kind: "save"; write: NoteWrite };
export type DeleteOp = OpBase & { kind: "delete" };
export type OutboxOp = SaveOp | DeleteOp;

/** One answered op, for the client to fold into its view (and pass to other tabs). */
export type OutboxEvent =
  | { kind: "save"; op: SaveOp; sent: NoteWrite; result: SendResult }
  | { kind: "delete"; op: DeleteOp; result: DeleteResult };

/** The device side: the queue, the versions this device's writes landed on, and a copy of the server list. */
export interface LocalNotesStore {
  /** Appends an op. A save replaces older saves of its note that were never sent (see `supersedes`). */
  add(op: OutboxOp): Promise<void>;
  /** The oldest op, marked in flight so `add` leaves it alone. */
  take(): Promise<OutboxOp | null>;
  /**
   * The op was answered: removes it and records the version its note now has
   * from this device (a number), forgets it (null) or leaves it (undefined).
   * Returns whether more ops for the note are waiting.
   */
  finish(op: OutboxOp, landedVersion: number | null | undefined): Promise<boolean>;
  /** The send failed: the op stays at the head, marked tried. */
  release(op: OutboxOp): Promise<void>;
  landedVersion(noteId: string): Promise<number | undefined>;
  pending(): Promise<OutboxOp[]>;
  count(): Promise<number>;
  loadSnapshot(): Promise<Note[] | null>;
  saveSnapshot(notes: readonly Note[]): Promise<void>;
}

/**
 * Whether a new save makes an older queued op redundant: a save of the same
 * note that was never sent and isn't in flight. A write carries the whole
 * note, so the newer one says everything the older did. A tried op stays: it
 * may already be on the server, and resending it first lets the newer write
 * build on it instead of conflicting with its own edit.
 */
export function supersedes(next: SaveOp, old: OutboxOp, inFlight: string | null): old is SaveOp {
  return old.kind === "save" && old.noteId === next.noteId && !old.tried && old.opId !== inFlight;
}

/** The op as stored: a restore flag survives the saves it was merged into. */
export function merged(next: SaveOp, dropped: readonly SaveOp[]): SaveOp {
  if (next.write.keepCurrent || !dropped.some((o) => o.write.keepCurrent)) return next;
  return { ...next, write: { ...next.write, keepCurrent: true } };
}

/** The store for demo and tests: the same rules, kept in memory. */
export class MemoryNotesStore implements LocalNotesStore {
  #ops: OutboxOp[] = [];
  #seq = 0;
  #inFlight: string | null = null;
  readonly #landed = new Map<string, number>();
  #snapshot: Note[] | null = null;

  add(op: OutboxOp): Promise<void> {
    let next = op;
    if (op.kind === "save") {
      const dropped = this.#ops.filter((o) => supersedes(op, o, this.#inFlight));
      next = merged(op, dropped);
      this.#ops = this.#ops.filter((o) => !dropped.includes(o as SaveOp));
    }
    this.#ops.push({ ...next, seq: ++this.#seq });
    return Promise.resolve();
  }

  take(): Promise<OutboxOp | null> {
    const head = this.#ops[0] ?? null;
    this.#inFlight = head?.opId ?? null;
    return Promise.resolve(head);
  }

  finish(op: OutboxOp, landedVersion: number | null | undefined): Promise<boolean> {
    this.#ops = this.#ops.filter((o) => o.opId !== op.opId);
    if (this.#inFlight === op.opId) this.#inFlight = null;
    if (landedVersion === null) this.#landed.delete(op.noteId);
    else if (landedVersion !== undefined) this.#landed.set(op.noteId, landedVersion);
    return Promise.resolve(this.#ops.some((o) => o.noteId === op.noteId));
  }

  release(op: OutboxOp): Promise<void> {
    this.#ops = this.#ops.map((o) => (o.opId === op.opId ? { ...o, tried: true } : o));
    if (this.#inFlight === op.opId) this.#inFlight = null;
    return Promise.resolve();
  }

  landedVersion(noteId: string): Promise<number | undefined> {
    return Promise.resolve(this.#landed.get(noteId));
  }

  pending(): Promise<OutboxOp[]> {
    return Promise.resolve([...this.#ops]);
  }

  count(): Promise<number> {
    return Promise.resolve(this.#ops.length);
  }

  loadSnapshot(): Promise<Note[] | null> {
    return Promise.resolve(this.#snapshot);
  }

  saveSnapshot(notes: readonly Note[]): Promise<void> {
    this.#snapshot = [...notes];
    return Promise.resolve();
  }
}

export interface OutboxOptions {
  store: LocalNotesStore | Promise<LocalNotesStore>;
  sendSave: (write: NoteWrite) => Promise<SendResult>;
  sendDelete: (id: string) => Promise<DeleteResult>;
  onEvent: (event: OutboxEvent) => void;
  onStatus: (id: string, status: NoteStatus) => void;
  /** The queue grew or shrank. */
  onChange?: () => void;
  /** False in demo: ops stay on the device and are never sent. */
  sync: boolean;
  online?: () => boolean;
  /** Runs one drain at a time across tabs (a Web Lock in the browser). */
  lock?: <T>(run: () => Promise<T>) => Promise<T>;
  retryMs?: number;
  /** A send with no answer by then counts as failed (and is resent). 0: no limit. */
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  now?: () => number;
  newId?: () => string;
}

type Failed = { ok: false; reason: "failed" };

export class Outbox {
  readonly #opts: Required<OutboxOptions>;
  #running: Promise<void> | null = null;
  #again = false;
  #retryArmed = false;

  constructor(opts: OutboxOptions) {
    this.#opts = {
      onChange: () => undefined,
      online: () => true,
      lock: (run) => run(),
      retryMs: 5_000,
      timeoutMs: 20_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      ...opts,
    };
  }

  /** Queues a write of the whole note, then sends what is queued. */
  enqueue(write: NoteWrite): Promise<void> {
    return this.#add({ kind: "save", noteId: write.id, write, ...this.#fresh() });
  }

  /** Queues a delete. It goes after the note's earlier writes, so an archive lands before it. */
  remove(id: string): Promise<void> {
    return this.#add({ kind: "delete", noteId: id, ...this.#fresh() });
  }

  async pending(): Promise<OutboxOp[]> {
    return (await this.#opts.store).pending();
  }

  async count(): Promise<number> {
    return (await this.#opts.store).count();
  }

  /** Sends everything queued, oldest first. Stops at a failure and tries again later. */
  flush(): Promise<void> {
    if (!this.#opts.sync) return Promise.resolve();
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#again = false;
    const run = async () => {
      do await this.#opts.lock(() => this.#drain());
      while (this.#takeAgain());
    };
    this.#running = run()
      .catch((error: unknown) => {
        console.error("notes outbox: flush failed", error);
      })
      .finally(() => {
        this.#running = null;
      });
    return this.#running;
  }

  /** Whether a flush was asked for while draining; resets the ask. */
  #takeAgain(): boolean {
    const again = this.#again;
    this.#again = false;
    return again;
  }

  #fresh() {
    return { opId: this.#opts.newId(), queuedAt: this.#opts.now(), tried: false };
  }

  async #add(op: OutboxOp): Promise<void> {
    try {
      await (await this.#opts.store).add(op);
    } catch (error) {
      console.error("notes outbox: could not store a write", error);
      this.#opts.onStatus(op.noteId, "error");
      return;
    }
    this.#opts.onChange();
    if (!this.#opts.sync) {
      this.#opts.onStatus(op.noteId, "local");
      return;
    }
    this.#opts.onStatus(op.noteId, this.#opts.online() ? "saving" : "queued");
    void this.flush();
  }

  async #drain(): Promise<void> {
    const store = await this.#opts.store;
    for (;;) {
      if (!this.#opts.online()) return;
      const op = await store.take();
      if (!op) return;
      this.#opts.onStatus(op.noteId, "saving");

      if (op.kind === "save") {
        // A write made before this device's last landing continues it, so it goes on that version.
        const known = await store.landedVersion(op.noteId);
        const sent = known !== undefined && known > op.write.baseVersion ? { ...op.write, baseVersion: known } : op.write;
        const result = await this.#call(() => this.#opts.sendSave(sent));
        if (this.#transient(result)) {
          await this.#hold(store, op);
          return;
        }
        // Lost a conflict: nothing of ours is on the server, so the next write must not build on it.
        const more = await store.finish(op, result.ok ? (landed(result) ? result.note.version : null) : undefined);
        this.#opts.onEvent({ kind: "save", op, sent, result });
        if (!more) this.#opts.onStatus(op.noteId, result.ok ? "saved" : "error");
      } else {
        const result = await this.#call(() => this.#opts.sendDelete(op.noteId));
        if (this.#transient(result)) {
          await this.#hold(store, op);
          return;
        }
        const more = await store.finish(op, result.ok ? null : undefined);
        this.#opts.onEvent({ kind: "delete", op, result });
        if (!more) this.#opts.onStatus(op.noteId, result.ok ? "saved" : "error");
      }
      this.#opts.onChange();
    }
  }

  /** Failed, or "demo" from a server that no longer sees the owner's session: keep it for later. */
  #transient(result: SendResult | DeleteResult): boolean {
    return !result.ok && (result.reason === "failed" || result.reason === "demo");
  }

  async #hold(store: LocalNotesStore, op: OutboxOp): Promise<void> {
    await store.release(op);
    const online = this.#opts.online();
    this.#opts.onStatus(op.noteId, online ? "retrying" : "queued");
    if (online && !this.#retryArmed) {
      this.#retryArmed = true;
      this.#opts.setTimer(() => {
        this.#retryArmed = false;
        void this.flush();
      }, this.#opts.retryMs);
    }
  }

  async #call<T>(send: () => Promise<T>): Promise<T | Failed> {
    const failed: Failed = { ok: false, reason: "failed" };
    const ms = this.#opts.timeoutMs;
    try {
      if (!ms) return await send();
      return await new Promise<T | Failed>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(failed);
        }, ms);
        send().then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    } catch {
      return failed;
    }
  }
}
