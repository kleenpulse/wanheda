import type Dexie from "dexie";
import type { Table } from "dexie";
import { openScopedDexie } from "@/lib/device/dexie";
import type { Note } from "./notes";
import { merged, supersedes, type LocalNotesStore, type OutboxOp, type SaveOp } from "./outbox";

/*
  The owner's notes on this device (ADR-0008): the outbox, the versions this
  device's writes landed on, and the last server list, so notes open and
  capture works without a connection. IndexedDB through Dexie, loaded only in
  the browser and only for the owner. Every queue rule runs inside one
  transaction, so tabs sharing the database can't interleave half a step.
*/

const DB_NAME = "wanheda-notes";

interface LandedRow {
  noteId: string;
  version: number;
}

interface MetaRow {
  key: "inFlight" | "snapshot";
  value: string | number | null;
}

type NotesDb = Dexie & {
  outbox: Table<OutboxOp, number>;
  landed: Table<LandedRow, string>;
  notes: Table<Note, string>;
  meta: Table<MetaRow, MetaRow["key"]>;
};

function stamp(n: Note): string {
  return `${String(n.version)}:${String(n.updatedAt)}:${String(n.editedAt)}`;
}

class DexieNotesStore implements LocalNotesStore {
  readonly #db: NotesDb;
  /** What the snapshot table holds, so a refresh writes only the notes that changed. */
  readonly #saved = new Map<string, string>();

  constructor(db: NotesDb) {
    this.#db = db;
  }

  async #inFlight(): Promise<string | null> {
    const row = await this.#db.meta.get("inFlight");
    return typeof row?.value === "string" ? row.value : null;
  }

  add(op: OutboxOp): Promise<void> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      let next = op;
      if (op.kind === "save") {
        const inFlight = await this.#inFlight();
        const same = await db.outbox.where("noteId").equals(op.noteId).toArray();
        const dropped = same.filter((o): o is SaveOp => supersedes(op, o, inFlight));
        next = merged(op, dropped);
        await db.outbox.bulkDelete(dropped.flatMap((o) => (o.seq === undefined ? [] : [o.seq])));
      }
      const { seq: _seq, ...row } = next;
      await db.outbox.add(row);
    });
  }

  take(): Promise<OutboxOp | null> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      const head = await db.outbox.orderBy("seq").first();
      await db.meta.put({ key: "inFlight", value: head?.opId ?? null });
      return head ?? null;
    });
  }

  finish(op: OutboxOp, landedVersion: number | null | undefined): Promise<boolean> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, db.landed, async () => {
      if (op.seq !== undefined) await db.outbox.delete(op.seq);
      if ((await this.#inFlight()) === op.opId) await db.meta.put({ key: "inFlight", value: null });
      if (landedVersion === null) await db.landed.delete(op.noteId);
      else if (landedVersion !== undefined) await db.landed.put({ noteId: op.noteId, version: landedVersion });
      return (await db.outbox.where("noteId").equals(op.noteId).count()) > 0;
    });
  }

  release(op: OutboxOp): Promise<void> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      if (op.seq !== undefined) await db.outbox.update(op.seq, { tried: true });
      if ((await this.#inFlight()) === op.opId) await db.meta.put({ key: "inFlight", value: null });
    });
  }

  async landedVersion(noteId: string): Promise<number | undefined> {
    return (await this.#db.landed.get(noteId))?.version;
  }

  pending(): Promise<OutboxOp[]> {
    return this.#db.outbox.orderBy("seq").toArray();
  }

  count(): Promise<number> {
    return this.#db.outbox.count();
  }

  loadSnapshot(): Promise<Note[] | null> {
    const db = this.#db;
    return db.transaction("r", db.notes, db.meta, async () => {
      // Never saved is not the same as an empty list.
      if (!(await db.meta.get("snapshot"))) return null;
      const notes = await db.notes.toArray();
      this.#saved.clear();
      for (const n of notes) this.#saved.set(n.id, stamp(n));
      return notes;
    });
  }

  saveSnapshot(notes: readonly Note[]): Promise<void> {
    const db = this.#db;
    const changed = notes.filter((n) => this.#saved.get(n.id) !== stamp(n));
    const keep = new Set(notes.map((n) => n.id));
    const removed = [...this.#saved.keys()].filter((id) => !keep.has(id));
    return db
      .transaction("rw", db.notes, db.meta, async () => {
        await db.notes.bulkPut(changed);
        await db.notes.bulkDelete(removed);
        await db.meta.put({ key: "snapshot", value: Date.now() });
      })
      .then(() => {
        for (const n of changed) this.#saved.set(n.id, stamp(n));
        for (const id of removed) this.#saved.delete(id);
      });
  }
}

/**
 * Opens this account's device store (`wanheda-notes@<scope>`, ADR-0015), so an
 * op queued by one user is never drained under another's session. Rejects
 * where IndexedDB is unavailable or no account is set; the caller falls back to memory.
 */
export async function openDeviceStore(): Promise<LocalNotesStore> {
  const db = await openScopedDexie<NotesDb>(DB_NAME, (d) => {
    d.version(1).stores({ outbox: "++seq, noteId", landed: "noteId", notes: "id", meta: "key" });
  });
  return new DexieNotesStore(db);
}
