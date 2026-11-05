import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const saveStored = vi.fn();
const deleteStored = vi.fn();
const removeStored = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/money/store", () => ({ saveTxn: saveStored, deleteTxn: deleteStored, removeCategory: removeStored }));

const { deleteTxn, removeCategory, saveTxn } = await import("./money");

const owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" } };
const ID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";
const WRITE = {
  id: ID,
  accountId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11",
  postedOn: "2026-11-05",
  amountMinor: -450_000,
  payee: "jollof",
  categoryId: null,
  note: "",
  tags: [],
};

beforeEach(() => {
  requireOwner.mockReset();
  saveStored.mockReset();
  deleteStored.mockReset();
  removeStored.mockReset();
});

describe("saveTxn", () => {
  it("saves nothing in demo", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await saveTxn(WRITE)).toEqual({ ok: false, reason: "demo" });
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("refuses bad shapes: floats, a client currency or user id", async () => {
    requireOwner.mockResolvedValue(owner);
    for (const bad of [{ ...WRITE, amountMinor: -4500.5 }, { ...WRITE, currency: "USD" }, { ...WRITE, userId: "x" }, null, "4500 food"]) {
      expect(await saveTxn(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("stores under the session's user and maps outcomes", async () => {
    requireOwner.mockResolvedValue(owner);
    const txn = { id: ID };
    saveStored.mockResolvedValueOnce({ kind: "saved", txn });
    expect(await saveTxn(WRITE)).toEqual({ ok: true, txn });
    expect(saveStored).toHaveBeenCalledWith("user-1", WRITE);

    saveStored.mockResolvedValueOnce({ kind: "not-yours" });
    expect(await saveTxn(WRITE)).toEqual({ ok: false, reason: "invalid" });
    saveStored.mockResolvedValueOnce({ kind: "archived-account" });
    expect(await saveTxn(WRITE)).toEqual({ ok: false, reason: "archived-account" });
    saveStored.mockResolvedValueOnce(null);
    expect(await saveTxn(WRITE)).toEqual({ ok: false, reason: "failed" });
    saveStored.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect(await saveTxn(WRITE)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("deleteTxn and removeCategory", () => {
  it("need the owner and a uuid", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await deleteTxn({ id: ID })).toEqual({ ok: false, reason: "demo" });
    expect(await removeCategory({ id: ID })).toEqual({ ok: false, reason: "demo" });
    requireOwner.mockResolvedValue(owner);
    expect(await deleteTxn({ id: "nope" })).toEqual({ ok: false, reason: "invalid" });
    expect(await removeCategory({ id: ID, userId: "x" })).toEqual({ ok: false, reason: "invalid" });
  });

  it("pass the session's user to the store", async () => {
    requireOwner.mockResolvedValue(owner);
    deleteStored.mockResolvedValue(true);
    expect(await deleteTxn({ id: ID })).toEqual({ ok: true });
    expect(deleteStored).toHaveBeenCalledWith("user-1", ID);
    removeStored.mockResolvedValue("archived");
    expect(await removeCategory({ id: ID })).toEqual({ ok: true, kind: "archived" });
    expect(removeStored).toHaveBeenCalledWith("user-1", ID);
  });
});
