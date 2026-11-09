import { afterEach, describe, expect, it, vi } from "vitest";

// A stand-in for Dexie: databases are named maps of tables of `{ id }` rows.
// Enough to show which database a store opens and what the adoption copies.
const fake = vi.hoisted(() => {
  type Row = { id: string; v?: string };
  const dbs = new Map<string, Map<string, Row[]>>();
  class BulkError extends Error {}
  class FakeTable {
    constructor(
      readonly name: string,
      private readonly rows: Row[],
    ) {}
    toArray() {
      return Promise.resolve([...this.rows]);
    }
    add(row: Row) {
      this.rows.push(row);
      return Promise.resolve();
    }
    bulkAdd(rows: Row[]) {
      let failed = 0;
      for (const row of rows) {
        if (this.rows.some((r) => r.id === row.id)) failed += 1;
        else this.rows.push(row);
      }
      return failed ? Promise.reject(new BulkError(`${String(failed)} existed`)) : Promise.resolve();
    }
  }
  class FakeDexie {
    static BulkError = BulkError;
    static exists = (name: string) => Promise.resolve(dbs.has(name));
    static delete = (name: string) => {
      dbs.delete(name);
      return Promise.resolve();
    };
    schema: Record<string, string> | null = null;
    constructor(readonly name: string) {}
    version() {
      return {
        stores: (schema: Record<string, string>) => {
          this.schema = schema;
        },
      };
    }
    open() {
      if (!dbs.has(this.name)) dbs.set(this.name, new Map(Object.keys(this.schema ?? {}).map((t) => [t, []])));
      return Promise.resolve(this);
    }
    get tables() {
      return [...(dbs.get(this.name)?.entries() ?? [])].map(([t, rows]) => new FakeTable(t, rows));
    }
    table(t: string) {
      const rows = dbs.get(this.name)?.get(t);
      if (!rows) throw new Error(`no table ${t}`);
      return new FakeTable(t, rows);
    }
    close() {}
  }
  return { dbs, FakeDexie };
});

vi.mock("dexie", () => ({ default: fake.FakeDexie }));

const { openScopedDexie } = await import("./dexie");
const { scopeFor, setDeviceScope } = await import("./scope");

type Db = InstanceType<typeof fake.FakeDexie>;
const define = (d: Db) => {
  d.version().stores({ outbox: "id", meta: "id" });
};
const open = () => openScopedDexie("wanheda-notes", define as never) as unknown as Promise<Db>;
const as = (id: string | null, admin = false) => {
  setDeviceScope(id === null ? null : scopeFor({ kind: "owner", id, admin }));
};

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});

afterEach(() => {
  fake.dbs.clear();
  storage.clear();
  setDeviceScope(null);
  vi.restoreAllMocks();
});

describe("openScopedDexie", () => {
  it("never shows one user's queued op to the next user on the same browser", async () => {
    as("A");
    await (await open()).table("outbox").add({ id: "op-1" });

    as("B");
    expect(await (await open()).table("outbox").toArray()).toEqual([]);

    as("A");
    expect(await (await open()).table("outbox").toArray()).toEqual([{ id: "op-1" }]);
    expect([...fake.dbs.keys()].sort()).toEqual(["wanheda-notes@u.A", "wanheda-notes@u.B"]);
  });

  it("refuses to open without an account, so the caller keeps writes in memory", async () => {
    as(null);
    await expect(open()).rejects.toThrow("no account scope");
    expect(fake.dbs.size).toBe(0);
  });
});

describe("the old unscoped store", () => {
  const legacy = () => {
    fake.dbs.set(
      "wanheda-notes",
      new Map([
        ["outbox", [{ id: "old-op" }]],
        ["meta", [{ id: "snapshot", v: "old" }]],
        ["gone", [{ id: "x" }]],
      ]),
    );
  };

  it("is adopted by the admin, then deleted", async () => {
    legacy();
    as("A", true);
    const db = await open();
    expect(await db.table("outbox").toArray()).toEqual([{ id: "old-op" }]);
    expect(fake.dbs.has("wanheda-notes")).toBe(false);
  });

  it("never overwrites a row the admin's store already has", async () => {
    as("A", true);
    await (await open()).table("meta").add({ id: "snapshot", v: "new" });
    legacy();
    const db = await open();
    expect(await db.table("meta").toArray()).toEqual([{ id: "snapshot", v: "new" }]);
    expect(await db.table("outbox").toArray()).toEqual([{ id: "old-op" }]);
  });

  it("is copied once, even while an old tab holds up its delete", async () => {
    legacy();
    vi.spyOn(fake.FakeDexie, "delete").mockResolvedValue(undefined);
    as("A", true);
    await open();
    // The op was sent and left the outbox; the old database is still there.
    fake.dbs.get("wanheda-notes@u.A")?.set("outbox", []);
    expect(fake.dbs.has("wanheda-notes")).toBe(true);
    const again = await open();
    expect(await again.table("outbox").toArray()).toEqual([]);
  });

  it("is left alone for anyone else", async () => {
    legacy();
    as("B");
    const db = await open();
    expect(await db.table("outbox").toArray()).toEqual([]);
    expect(fake.dbs.has("wanheda-notes")).toBe(true);
  });
});
