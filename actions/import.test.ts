import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const importStored = vi.fn();
const undoStored = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/money/import-store", () => ({ importStatement: importStored, undoImport: undoStored }));

const { importStatement, undoImport } = await import("./import");

const owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" } };
const WRITE = {
  batchId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a30",
  accountId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11",
  filename: "oct.csv",
  fileKey: "a".repeat(64),
  rows: [{ key: "ref:1", rowNo: 2, postedOn: "2026-11-01", amountMinor: -500, payee: "POS" }],
  skipped: [{ rowNo: 6, reason: "Not a date" }],
  mapping: null,
};

beforeEach(() => {
  requireOwner.mockReset();
  importStored.mockReset();
  undoStored.mockReset();
});

describe("importStatement action (V7, V32)", () => {
  it("keeps demo imports on the device", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await importStatement(WRITE)).toEqual({ ok: false, reason: "demo" });
    expect(importStored).not.toHaveBeenCalled();
  });

  it("refuses a malformed write before the store sees it", async () => {
    requireOwner.mockResolvedValue(owner);
    expect(await importStatement({ ...WRITE, rows: [] })).toEqual({ ok: false, reason: "invalid" });
    expect(importStored).not.toHaveBeenCalled();
  });

  it("imports as the session's owner", async () => {
    requireOwner.mockResolvedValue(owner);
    const batch = { id: WRITE.batchId, accountId: WRITE.accountId, filename: "oct.csv", rowsTotal: 2, rowsImported: 1, rowsSkipped: 1, createdAt: 1 };
    importStored.mockResolvedValue({ kind: "imported", batch, txns: [] });
    expect(await importStatement(WRITE)).toEqual({ ok: true, batch, txns: [] });
    expect(importStored).toHaveBeenCalledWith("user-1", WRITE);
  });

  it("says when the same file is in already", async () => {
    requireOwner.mockResolvedValue(owner);
    importStored.mockResolvedValue({ kind: "already", importedOn: 1_700_000_000_000 });
    expect(await importStatement(WRITE)).toEqual({ ok: false, reason: "already", importedOn: 1_700_000_000_000 });
  });

  it("maps another owner's account to invalid, an archived one to its reason, and a throw to failed", async () => {
    requireOwner.mockResolvedValue(owner);
    importStored.mockResolvedValueOnce({ kind: "not-yours" });
    expect(await importStatement(WRITE)).toEqual({ ok: false, reason: "invalid" });
    importStored.mockResolvedValueOnce({ kind: "archived-account" });
    expect(await importStatement(WRITE)).toEqual({ ok: false, reason: "archived-account" });
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    importStored.mockRejectedValueOnce(new Error("db down"));
    expect(await importStatement(WRITE)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("undoImport action", () => {
  it("deletes the owner's batch and reports the rows removed", async () => {
    requireOwner.mockResolvedValue(owner);
    undoStored.mockResolvedValue(3);
    expect(await undoImport({ id: WRITE.batchId })).toEqual({ ok: true, removed: 3 });
    expect(undoStored).toHaveBeenCalledWith("user-1", WRITE.batchId);
  });

  it("refuses demo and a bad id", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await undoImport({ id: WRITE.batchId })).toEqual({ ok: false, reason: "demo" });
    requireOwner.mockResolvedValue(owner);
    expect(await undoImport({ id: "nope" })).toEqual({ ok: false, reason: "invalid" });
    expect(undoStored).not.toHaveBeenCalled();
  });
});
