import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const saveStored = vi.fn();
const deleteStored = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/notes/store", () => ({ saveNote: saveStored, deleteNote: deleteStored }));

const { deleteNote, saveNote } = await import("./notes");

const owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" } };
const ID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";
const WRITE = {
  id: ID,
  title: "T",
  bodyMd: "body",
  color: "plain",
  pinned: false,
  archived: false,
  tags: [],
  baseVersion: 0,
  editedAt: 1_800_000_000_000,
};

beforeEach(() => {
  requireOwner.mockReset();
  saveStored.mockReset();
  deleteStored.mockReset();
});

describe("saveNote", () => {
  it("saves nothing in demo", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await saveNote(WRITE)).toEqual({ ok: false, reason: "demo" });
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("refuses bad shapes, including a client-sent user id", async () => {
    requireOwner.mockResolvedValue(owner);
    for (const bad of [{ ...WRITE, userId: "someone" }, { ...WRITE, id: "x" }, null, "note"]) {
      expect(await saveNote(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(saveStored).not.toHaveBeenCalled();
  });

  it("stores under the session's user and passes the outcome through", async () => {
    requireOwner.mockResolvedValue(owner);
    const stored = { id: ID, version: 1 };
    saveStored.mockResolvedValue({ kind: "conflict", note: stored, won: false });
    expect(await saveNote(WRITE)).toEqual({ ok: true, kind: "conflict", note: stored, won: false });
    expect(saveStored).toHaveBeenCalledWith("user-1", WRITE);
  });

  it("passes a restore's keepCurrent through, and refuses any other value for it", async () => {
    requireOwner.mockResolvedValue(owner);
    saveStored.mockResolvedValue({ kind: "saved", note: { id: ID, version: 2 } });
    await saveNote({ ...WRITE, keepCurrent: true });
    expect(saveStored).toHaveBeenLastCalledWith("user-1", { ...WRITE, keepCurrent: true });
    expect(await saveNote({ ...WRITE, keepCurrent: false })).toEqual({ ok: false, reason: "invalid" });
  });

  it("treats someone else's id as invalid and a thrown store as failed", async () => {
    requireOwner.mockResolvedValue(owner);
    saveStored.mockResolvedValueOnce({ kind: "not-yours" });
    expect(await saveNote(WRITE)).toEqual({ ok: false, reason: "invalid" });
    saveStored.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect(await saveNote(WRITE)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("deleteNote", () => {
  it("deletes for the session's user only, uuid ids only", async () => {
    requireOwner.mockResolvedValue(owner);
    deleteStored.mockResolvedValue(true);
    expect(await deleteNote({ id: ID })).toEqual({ ok: true });
    expect(deleteStored).toHaveBeenCalledWith("user-1", ID);
    expect(await deleteNote({ id: "1 or 1=1" })).toEqual({ ok: false, reason: "invalid" });
  });

  it("counts nothing to delete (already gone, or unarchived elsewhere) as done, so the outbox drops it", async () => {
    requireOwner.mockResolvedValue(owner);
    deleteStored.mockResolvedValue(false);
    expect(await deleteNote({ id: ID })).toEqual({ ok: true });
  });

  it("says failed without a database or when the delete throws, so the outbox retries", async () => {
    requireOwner.mockResolvedValue(owner);
    deleteStored.mockResolvedValueOnce(null);
    expect(await deleteNote({ id: ID })).toEqual({ ok: false, reason: "failed" });
    deleteStored.mockRejectedValueOnce(new Error("db down"));
    expect(await deleteNote({ id: ID })).toEqual({ ok: false, reason: "failed" });
  });
});
