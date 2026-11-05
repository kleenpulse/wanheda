import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const addNotice = vi.fn();
const markNoticesRead = vi.fn();
const deleteNotices = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/notifications/store", () => ({ addNotice, deleteNotices, markNoticesRead }));

const { deleteNotifications, markNotificationsRead, notifyTimerDone } = await import("./notifications");

const owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" } };
const NOW = 1_800_000_000_000;
const TIMER = { id: "t1", label: "25 min timer", endsAt: NOW - 1000, totalMs: 1_500_000 };
const UUID = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10";

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  requireOwner.mockReset();
  addNotice.mockReset();
  markNoticesRead.mockReset();
  deleteNotices.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifyTimerDone", () => {
  it("records nothing in demo", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await notifyTimerDone(TIMER)).toEqual({ ok: false, reason: "demo" });
    expect(addNotice).not.toHaveBeenCalled();
  });

  it("refuses a timer that hasn't ended, and bad shapes", async () => {
    requireOwner.mockResolvedValue(owner);
    expect(await notifyTimerDone({ ...TIMER, endsAt: NOW + 60_000 })).toEqual({ ok: false, reason: "invalid" });
    expect(await notifyTimerDone({ ...TIMER, kind: "money-alert" })).toEqual({ ok: false, reason: "invalid" });
    expect(await notifyTimerDone({ ...TIMER, label: "x".repeat(500) })).toEqual({ ok: false, reason: "invalid" });
    expect(addNotice).not.toHaveBeenCalled();
  });

  it("builds the alert itself and stores it under the session's user, keyed by the run", async () => {
    requireOwner.mockResolvedValue(owner);
    const stored = { id: UUID, kind: "timer", title: "Timer done", body: "25 min timer", href: null, dedupeKey: "timer:t1", createdAt: NOW, readAt: null };
    addNotice.mockResolvedValue(stored);
    expect(await notifyTimerDone(TIMER)).toEqual({ ok: true, notice: stored });
    expect(addNotice).toHaveBeenCalledWith("user-1", {
      kind: "timer",
      title: "Timer done",
      body: "25 min timer",
      href: null,
      dedupeKey: `timer:t1:${String(TIMER.endsAt)}`,
    });
  });
});

describe("markNotificationsRead", () => {
  it("marks ids or all, for the session's user only", async () => {
    requireOwner.mockResolvedValue(owner);
    markNoticesRead.mockResolvedValue(true);
    expect(await markNotificationsRead({ ids: [UUID] })).toEqual({ ok: true });
    expect(await markNotificationsRead({ all: true })).toEqual({ ok: true });
    expect(markNoticesRead).toHaveBeenNthCalledWith(1, "user-1", [UUID]);
    expect(markNoticesRead).toHaveBeenNthCalledWith(2, "user-1", "all");
  });

  it("rejects non-uuid ids and empty or odd input", async () => {
    requireOwner.mockResolvedValue(owner);
    for (const bad of [{ ids: ["1 or 1=1"] }, { ids: [] }, { all: false }, {}, null]) {
      expect(await markNotificationsRead(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(markNoticesRead).not.toHaveBeenCalled();
  });
});

describe("deleteNotifications", () => {
  it("deletes nothing in demo", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await deleteNotifications({ ids: [UUID] })).toEqual({ ok: false, reason: "demo" });
    expect(deleteNotices).not.toHaveBeenCalled();
  });

  it("refuses an empty list, a non-uuid, too many ids and extra keys", async () => {
    requireOwner.mockResolvedValue(owner);
    for (const input of [{ ids: [] }, { ids: ["nope"] }, { ids: Array.from({ length: 51 }, () => UUID) }, { ids: [UUID], all: true }, null]) {
      expect(await deleteNotifications(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(deleteNotices).not.toHaveBeenCalled();
  });

  it("deletes as the session's owner, and reports a failed write", async () => {
    requireOwner.mockResolvedValue(owner);
    deleteNotices.mockResolvedValueOnce(true);
    expect(await deleteNotifications({ ids: [UUID] })).toEqual({ ok: true });
    expect(deleteNotices).toHaveBeenCalledWith("user-1", [UUID]);
    deleteNotices.mockResolvedValueOnce(false);
    expect(await deleteNotifications({ ids: [UUID] })).toEqual({ ok: false, reason: "failed" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deleteNotices.mockRejectedValueOnce(new Error("down"));
    expect(await deleteNotifications({ ids: [UUID] })).toEqual({ ok: false, reason: "failed" });
  });
});
