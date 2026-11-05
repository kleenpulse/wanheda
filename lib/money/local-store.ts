import Dexie, { type Table } from "dexie";
import { supersedes, type MoneyOp, type MoneyQueueStore } from "./outbox";

/*
  The owner's money outbox on this device (ADR-0008, SPEC V28). IndexedDB
  through Dexie, loaded only in the browser and only for the owner. Every
  queue rule runs inside one transaction, so tabs sharing the database can't
  interleave half a step.
*/

const DB_NAME = "wanheda-money";

interface MetaRow {
  key: "inFlight";
  value: string | null;
}

type MoneyDb = Dexie & {
  outbox: Table<MoneyOp, number>;
  meta: Table<MetaRow, MetaRow["key"]>;
};

class DexieMoneyStore implements MoneyQueueStore {
  readonly #db: MoneyDb;

  constructor(db: MoneyDb) {
    this.#db = db;
  }

  async #inFlight(): Promise<string | null> {
    return (await this.#db.meta.get("inFlight"))?.value ?? null;
  }

  add(op: MoneyOp): Promise<void> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      const inFlight = await this.#inFlight();
      const same = await db.outbox.where("key").equals(op.key).toArray();
      const dropped = same.filter((o) => supersedes(op, o, inFlight));
      await db.outbox.bulkDelete(dropped.flatMap((o) => (o.seq === undefined ? [] : [o.seq])));
      const { seq: _seq, ...row } = op;
      await db.outbox.add(row);
    });
  }

  take(): Promise<MoneyOp | null> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      const head = await db.outbox.orderBy("seq").first();
      await db.meta.put({ key: "inFlight", value: head?.opId ?? null });
      return head ?? null;
    });
  }

  finish(op: MoneyOp): Promise<boolean> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      if (op.seq !== undefined) await db.outbox.delete(op.seq);
      if ((await this.#inFlight()) === op.opId) await db.meta.put({ key: "inFlight", value: null });
      return (await db.outbox.where("key").equals(op.key).count()) > 0;
    });
  }

  release(op: MoneyOp): Promise<void> {
    const db = this.#db;
    return db.transaction("rw", db.outbox, db.meta, async () => {
      if (op.seq !== undefined) await db.outbox.update(op.seq, { tried: true });
      if ((await this.#inFlight()) === op.opId) await db.meta.put({ key: "inFlight", value: null });
    });
  }

  pending(): Promise<MoneyOp[]> {
    return this.#db.outbox.orderBy("seq").toArray();
  }

  count(): Promise<number> {
    return this.#db.outbox.count();
  }
}

/** Opens the device queue. Rejects where IndexedDB is unavailable; the caller falls back to memory. */
export async function openMoneyStore(): Promise<MoneyQueueStore> {
  const db = new Dexie(DB_NAME) as MoneyDb;
  db.version(1).stores({ outbox: "++seq, key", meta: "key" });
  await db.open();
  return new DexieMoneyStore(db);
}
