import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb, type FakeQuery } from "@/lib/db/fake";
import type { Rule } from "./rules";

// importStatement's own logic (V12, V32): ownership, "already imported",
// replays, races and what each row is written as. The unique keys doing the
// deduping are Postgres's; the T39 exit test proves the keys are stable.

vi.mock("server-only", () => ({}));
let fake: FakeDb | null = null;
vi.mock("@/lib/db", () => ({ getDb: () => fake?.db ?? null }));
const loadRules = vi.fn<() => Promise<Rule[]>>(() => Promise.resolve([]));
vi.mock("./plans-store", () => ({ loadRules }));
const loadCategories = vi.fn(() => Promise.resolve([] as { id: string; archived: boolean }[]));
vi.mock("./store", async (original) => ({ ...(await original<typeof import("./store")>()), loadCategories }));

const { checkImport, importStatement, undoImport } = await import("./import-store");

const USER = "user-1";
const BATCH = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a30";
const ACCOUNT = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11";
const WRITE = {
  batchId: BATCH,
  accountId: ACCOUNT,
  filename: "oct.csv",
  fileKey: "a".repeat(64),
  rows: [
    { key: "k1", rowNo: 2, postedOn: "2026-10-08", amountMinor: -440_000, payee: "NETFLIX.COM" },
    { key: "k2", rowNo: 3, postedOn: "2026-10-09", amountMinor: -250_000, payee: "UBER TRIP" },
  ],
  skipped: [{ rowNo: 4, reason: "Not a date" }],
  mapping: null,
};
const ON = new Date("2026-10-31T09:00:00Z");

const batchRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  userId: USER,
  accountId: ACCOUNT,
  filename: "oct.csv",
  mappingId: null,
  rowsTotal: 3,
  rowsImported: 2,
  rowsSkipped: 1,
  skipped: [],
  idempotencyKey: WRITE.fileKey,
  createdAt: ON,
  ...over,
});
const txnRow = (r: (typeof WRITE.rows)[number] | undefined, over: Record<string, unknown> = {}) => ({
  id: `id-${r?.key ?? "x"}`,
  userId: USER,
  accountId: ACCOUNT,
  postedOn: r?.postedOn ?? "2026-10-01",
  amountMinor: r?.amountMinor ?? -1,
  currency: "NGN",
  payee: r?.payee ?? "",
  categoryId: null,
  note: "",
  tags: [],
  source: "import",
  externalId: r?.key ?? null,
  importBatchId: BATCH,
  transferId: null,
  attachmentKey: null,
  createdAt: ON,
  updatedAt: ON,
  ...over,
});

/** The answers: the account read, the file-key lookups (in order), and the batch write. */
function world(o: { account?: unknown[]; byKey?: unknown[][]; written?: () => unknown; replayTxns?: unknown[] }) {
  const byKey = [...(o.byKey ?? [[]])];
  fake = fakeDb((q: FakeQuery) => {
    if (q.op === "select" && q.table === "money_account") return o.account ?? [{ currency: "NGN", archived: false }];
    if (q.op === "select" && q.table === "import_batch") return byKey.shift() ?? [];
    if (q.op === "select" && q.table === "txn") return o.replayTxns ?? [];
    if (q.op === "insert" && q.table === "txn") return (q.values as { externalId: string }[]).map((v) => txnRow(WRITE.rows.find((r) => r.key === v.externalId) ?? WRITE.rows[0], v));
    if (q.op === "update" && q.table === "import_batch") return [batchRow(BATCH)];
    if (q.op === "insert") return o.written ? o.written() : [];
    return [];
  });
  return fake;
}

beforeEach(() => {
  fake = null;
  loadRules.mockClear();
  loadCategories.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("importStatement", () => {
  it("is null without a database (V9)", async () => {
    expect(await importStatement(USER, WRITE)).toBeNull();
  });

  it("refuses an account that isn't the owner's, or has an unknown currency, or is archived", async () => {
    world({ account: [] });
    expect(await importStatement(USER, WRITE)).toEqual({ kind: "not-yours" });
    world({ account: [{ currency: "XXX", archived: false }] });
    expect(await importStatement(USER, WRITE)).toEqual({ kind: "not-yours" });
    const f = world({ account: [{ currency: "NGN", archived: true }] });
    expect(await importStatement(USER, WRITE)).toEqual({ kind: "archived-account" });
    expect(f.queries.some((q) => q.op === "insert")).toBe(false);
  });

  it("the same file again: writes nothing and says when it went in", async () => {
    const f = world({ byKey: [[batchRow("0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a99")]] });
    expect(await importStatement(USER, WRITE)).toEqual({ kind: "already", importedOn: ON.getTime() });
    expect(f.queries.some((q) => q.op === "insert")).toBe(false);
    expect(f.batches).toBe(0);
  });

  it("a replay of the same import gets its own result back, not 'already'", async () => {
    world({ byKey: [[batchRow(BATCH)]], replayTxns: WRITE.rows.map((r) => txnRow(r)) });
    const got = await importStatement(USER, WRITE);
    expect(got?.kind).toBe("imported");
    expect(got?.kind === "imported" && got.txns.map((t) => t.payee)).toEqual(["NETFLIX.COM", "UBER TRIP"]);
  });

  it("writes the batch and every row in one batch, in the account's currency, rules applied", async () => {
    loadRules.mockResolvedValueOnce([
      { id: "r1", payeeContains: "netflix", categoryId: "subs", tags: ["tv"], priority: 0, enabled: true, createdAt: 0 },
      { id: "r2", payeeContains: "uber", categoryId: "gone", tags: ["ride"], priority: 1, enabled: true, createdAt: 0 },
    ]);
    // "gone" is archived: that rule only adds its tags.
    loadCategories.mockResolvedValueOnce([
      { id: "subs", archived: false },
      { id: "gone", archived: true },
    ]);
    const f = world({});
    const got = await importStatement(USER, WRITE);
    expect(f.batches).toBe(1);
    const batchInsert = f.queries.find((q) => q.op === "insert" && q.table === "import_batch");
    expect(batchInsert?.values).toMatchObject({ id: BATCH, userId: USER, rowsTotal: 3, rowsImported: 0, rowsSkipped: 1, idempotencyKey: WRITE.fileKey, mappingId: null });
    const rows = f.queries.find((q) => q.op === "insert" && q.table === "txn")?.values as Record<string, unknown>[];
    expect(rows.map((r) => [r.externalId, r.currency, r.source, r.categoryId, r.tags, r.importBatchId])).toEqual([
      ["k1", "NGN", "import", "subs", ["tv"], BATCH],
      ["k2", "NGN", "import", null, ["ride"], BATCH],
    ]);
    // The txn insert skips rows already on the account (overlap ⇒ 0, V12).
    expect(f.queries.find((q) => q.op === "insert" && q.table === "txn")?.calls.some((c) => c.method === "onConflictDoNothing")).toBe(true);
    expect(got).toMatchObject({ kind: "imported", batch: { id: BATCH, rowsImported: 2, createdAt: ON.getTime() } });
    expect(got?.kind === "imported" && got.txns).toHaveLength(2);
  });

  it("saves the mapping first when one is sent", async () => {
    const f = world({});
    await importStatement(USER, { ...WRITE, mapping: { bankName: "GTBank", columns: {} as never } });
    const inserts = f.queries.filter((q) => q.op === "insert").map((q) => q.table);
    expect(inserts).toEqual(["import_mapping", "import_batch", "txn"]);
  });

  it("splits large statements into 500-row inserts", async () => {
    const rows = Array.from({ length: 1_201 }, (_, i) => ({ key: `k${String(i)}`, rowNo: i + 2, postedOn: "2026-10-08", amountMinor: -100, payee: "X" }));
    const f = world({});
    await importStatement(USER, { ...WRITE, rows });
    expect(f.queries.filter((q) => q.op === "insert" && q.table === "txn").map((q) => (q.values as unknown[]).length)).toEqual([500, 500, 201]);
  });

  it("two imports of one file at once: the loser answers like the same file again", async () => {
    world({ byKey: [[], [batchRow("0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a99")]], written: () => {
      throw Object.assign(new Error("duplicate key"), { code: "23505" });
    } });
    expect(await importStatement(USER, WRITE)).toEqual({ kind: "already", importedOn: ON.getTime() });
  });

  it("any other failure is thrown", async () => {
    world({ written: () => {
      throw new Error("connection reset");
    } });
    await expect(importStatement(USER, WRITE)).rejects.toThrow("connection reset");
  });
});

describe("undoImport and checkImport", () => {
  it("undo returns the rows removed, 0 when already gone, null without a database", async () => {
    expect(await undoImport(USER, BATCH)).toBeNull();
    fake = fakeDb((q) => (q.op === "delete" ? [{ rowsImported: 7 }] : []));
    expect(await undoImport(USER, BATCH)).toBe(7);
    fake = fakeDb(() => []);
    expect(await undoImport(USER, BATCH)).toBe(0);
  });

  it("check reports the first import's date and which keys are present", async () => {
    fake = fakeDb((q) => (q.table === "import_batch" ? [{ createdAt: ON }] : [{ key: "k1" }, { key: null }]));
    expect(await checkImport(USER, ACCOUNT, WRITE.fileKey, ["k1", "k2"])).toEqual({ importedOn: ON.getTime(), present: ["k1"] });
    fake = fakeDb((q) => (q.table === "import_batch" ? [] : []));
    expect(await checkImport(USER, ACCOUNT, WRITE.fileKey, [])).toEqual({ importedOn: null, present: [] });
  });
});
