import { afterEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { fakeDb, type FakeDb, type FakeQuery } from "@/lib/db/fake";

vi.mock("server-only", () => ({}));
let fake: FakeDb | null = null;
const getDb = vi.fn(() => fake?.db ?? null);
vi.mock("@/lib/db", () => ({ getDb: () => getDb() }));

const { createDocument, saveProgress, updateDocument } = await import("./store");
const { readerFor } = await import("./server");

const USER = "owner-1";
const ID = "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0001";
const OTHER = "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0009";
const SHA = "b".repeat(64);
const NOW = Date.UTC(2026, 10, 6, 12);

const row = (id: string) => ({
  id,
  kind: "pdf",
  title: "T",
  author: null,
  fileName: "t.pdf",
  sha256: SHA,
  sizeBytes: 10,
  pages: null,
  tags: [],
  mode: "scroll",
  lastOpenedAt: null,
  createdAt: new Date(NOW),
});

const create = { id: ID, kind: "pdf" as const, title: "T", author: null, fileName: "t.pdf", sha256: SHA, sizeBytes: 10, pages: null, tags: [] };

afterEach(() => {
  fake = null;
  getDb.mockClear();
});

/** A db where the row held for (user, sha256) has id `held`, or none. */
function withHeld(held: string | null) {
  return fakeDb((q: FakeQuery) => {
    if (q.op === "insert") return [];
    if (q.op === "select" && q.table === "document") return held ? [row(held)] : [];
    return [];
  });
}

describe("createDocument (V39)", () => {
  it("creates a new row by its hash", async () => {
    fake = withHeld(ID);
    expect(await createDocument(USER, create)).toMatchObject({ kind: "created", doc: { id: ID, sha256: SHA } });
  });

  it("opens the row the same file already has, from any device", async () => {
    fake = withHeld(OTHER);
    expect(await createDocument(USER, create)).toMatchObject({ kind: "existing", doc: { id: OTHER } });
  });

  it("refuses an id another user holds: nothing held under this user", async () => {
    fake = withHeld(null);
    expect(await createDocument(USER, create)).toEqual({ kind: "not-yours" });
  });

  it("opens a new PDF as a book, a new text as a scroll (V42)", async () => {
    fake = withHeld(ID);
    await createDocument(USER, create);
    await createDocument(USER, { ...create, kind: "md", fileName: "t.md" });
    const modes = fake.queries
      .filter((q) => q.op === "insert")
      .map((q) => (q.calls.find((c) => c.method === "values")?.args[0] as { mode?: string } | undefined)?.mode);
    expect(modes).toEqual(["flip", "scroll"]);
  });

  it("scopes the hash lookup to the owner", async () => {
    fake = withHeld(ID);
    await createDocument(USER, create);
    const lookup = fake.queries.find((q) => q.op === "select" && q.table === "document");
    const where = lookup?.calls.find((c) => c.method === "where")?.args[0] as SQL;
    const q = new PgDialect().sqlToQuery(where);
    expect(q.sql).toContain("\"user_id\"");
    expect(q.params).toEqual([USER, SHA]);
  });
});

describe("saveProgress (V41)", () => {
  const w = { documentId: ID, locator: "pdf:3:0", percent: 10, at: NOW };

  it("writes nothing for a document that isn't the owner's", async () => {
    fake = fakeDb((q) => (q.op === "update" ? [] : []));
    expect(await saveProgress(USER, w, NOW)).toEqual({ kind: "gone" });
    expect(fake.queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("hands back the newer position when the write is stale", async () => {
    const newer = { documentId: ID, locator: "pdf:9:0", percent: 40, at: new Date(NOW + 1000) };
    fake = fakeDb((q) => {
      if (q.op === "update") return [{ id: ID }];
      if (q.op === "insert") return [];
      return [newer];
    });
    expect(await saveProgress(USER, w, NOW)).toEqual({ kind: "stale", progress: { locator: "pdf:9:0", percent: 40, at: NOW + 1000 } });
  });

  it("holds a client clock from the future back to now plus the skew", async () => {
    fake = fakeDb((q) => (q.op === "update" ? [{ id: ID }] : q.op === "insert" ? [{ documentId: ID, locator: w.locator, percent: 10, at: new Date(NOW) }] : []));
    await saveProgress(USER, { ...w, at: NOW + 10 * 86_400_000 }, NOW);
    const insert = fake.queries.find((q) => q.op === "insert");
    expect((insert?.values as { at: Date }).at.getTime()).toBe(NOW + 5 * 60_000);
  });
});

describe("updateDocument", () => {
  it("refuses collections the owner doesn't have, before writing", async () => {
    fake = fakeDb((q) => (q.op === "select" && q.table === "document" ? [{ id: ID }] : q.op === "select" && q.table === "collection" ? [] : []));
    expect(await updateDocument(USER, { id: ID, collections: [OTHER] })).toEqual({ kind: "not-yours" });
    expect(fake.queries.some((q) => q.op === "update" || q.op === "insert" || q.op === "delete")).toBe(false);
  });
});

describe("readerFor", () => {
  it("serves demo its seed without touching the database (G4)", async () => {
    const payload = await readerFor({ kind: "demo" }, NOW);
    expect(payload.source).toBe("demo");
    expect(payload.documents.length).toBeGreaterThan(0);
    expect(getDb).not.toHaveBeenCalled();
  });
});
