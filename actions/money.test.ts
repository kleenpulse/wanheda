import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const saveStored = vi.fn();
const deleteStored = vi.fn();
const removeStored = vi.fn();
const saveCat = vi.fn();
const saveSub = vi.fn();
const deleteSub = vi.fn();
const raise = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/money/store", () => ({
  saveTxn: saveStored,
  deleteTxn: deleteStored,
  removeCategory: removeStored,
  saveCategory: saveCat,
  saveSubscription: saveSub,
  deleteSubscription: deleteSub,
}));
vi.mock("@/lib/money/alerts", () => ({ raiseMoneyAlerts: raise, raiseBudgetAlerts: vi.fn(() => Promise.resolve([])) }));

const { deleteSubscription, deleteTxn, removeCategory, saveCategory, saveSubscription, saveTxn } = await import("./money");

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
  saveSub.mockReset();
  deleteSub.mockReset();
  raise.mockReset();
});

const SUB = {
  id: ID,
  name: "Netflix",
  amountMinor: 1_549,
  currency: "USD",
  cycle: "month",
  intervalCount: 1,
  anchorOn: "2026-11-05",
  trialEndsOn: null,
  remindDays: 3,
  accountId: null,
  categoryId: null,
  status: "active",
  cancelUrl: null,
};

describe("saveSubscription", () => {
  it("saves nothing in demo and refuses bad shapes", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await saveSubscription(SUB)).toEqual({ ok: false, reason: "demo" });
    requireOwner.mockResolvedValue(owner);
    for (const bad of [{ ...SUB, amountMinor: 15.49 }, { ...SUB, userId: "x" }, { ...SUB, detectedFromTxn: true }, { ...SUB, cancelUrl: "javascript:x" }]) {
      expect(await saveSubscription(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(saveSub).not.toHaveBeenCalled();
  });

  it("stores under the session's user, raises its reminders, and maps outcomes", async () => {
    requireOwner.mockResolvedValue(owner);
    const subscription = { id: ID };
    const notices = [{ id: "n1" }];
    saveSub.mockResolvedValueOnce({ kind: "saved", subscription });
    raise.mockResolvedValueOnce(notices);
    expect(await saveSubscription(SUB)).toEqual({ ok: true, subscription, notices });
    expect(saveSub).toHaveBeenCalledWith("user-1", SUB);
    expect(raise).toHaveBeenCalledWith("user-1", ID);

    saveSub.mockResolvedValueOnce({ kind: "not-yours" });
    expect(await saveSubscription(SUB)).toEqual({ ok: false, reason: "invalid" });
    saveSub.mockResolvedValueOnce(null);
    expect(await saveSubscription(SUB)).toEqual({ ok: false, reason: "failed" });
    saveSub.mockRejectedValueOnce(new Error("down"));
    expect(await saveSubscription(SUB)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("deleteSubscription", () => {
  it("deletes the session user's row; gone counts as done", async () => {
    requireOwner.mockResolvedValue(owner);
    deleteSub.mockResolvedValueOnce(true);
    expect(await deleteSubscription({ id: ID })).toEqual({ ok: true });
    expect(deleteSub).toHaveBeenCalledWith("user-1", ID);
    deleteSub.mockResolvedValueOnce(null);
    expect(await deleteSubscription({ id: ID })).toEqual({ ok: false, reason: "failed" });
    expect(await deleteSubscription({ id: "nope" })).toEqual({ ok: false, reason: "invalid" });
  });
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
    expect(await saveTxn(WRITE)).toEqual({ ok: true, txn, notices: [] });
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

describe("saveCategory", () => {
  const input = { id: ID, name: "Gym", kind: "expense", emoji: "🏷️", color: "slate" };

  it("stores under the session's user and maps outcomes", async () => {
    requireOwner.mockResolvedValue(owner);
    const category = { id: ID, slug: null, name: "Gym", parentId: null, emoji: "🏷️", color: "slate", kind: "expense", archived: false };
    saveCat.mockReset().mockResolvedValue(category);
    expect(await saveCategory(input)).toEqual({ ok: true, category });
    expect(saveCat).toHaveBeenCalledWith("user-1", input);
    saveCat.mockResolvedValue("not-yours");
    expect(await saveCategory(input)).toEqual({ ok: false, reason: "invalid" });
    saveCat.mockResolvedValue(null);
    expect(await saveCategory(input)).toEqual({ ok: false, reason: "failed" });
    saveCat.mockRejectedValue(new Error("down"));
    expect(await saveCategory(input)).toEqual({ ok: false, reason: "failed" });
  });

  it("refuses demo and bad input before the store", async () => {
    saveCat.mockReset();
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await saveCategory(input)).toEqual({ ok: false, reason: "demo" });
    requireOwner.mockResolvedValue(owner);
    expect(await saveCategory({ ...input, userId: "other" })).toEqual({ ok: false, reason: "invalid" });
    expect(saveCat).not.toHaveBeenCalled();
  });
});
