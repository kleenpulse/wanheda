import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const savePrefsStore = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/prefs/store", () => ({ savePrefs: savePrefsStore }));

const { savePrefs } = await import("./prefs");

const owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" } };
const GOOD = { skin: "bench", accent: "#a855f7", wallpaper: "aurora", timerMode: "single" };

beforeEach(() => {
  requireOwner.mockReset();
  savePrefsStore.mockReset();
});

describe("savePrefs", () => {
  it("never saves demo prefs", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await savePrefs(GOOD)).toEqual({ ok: false, reason: "demo" });
    expect(savePrefsStore).not.toHaveBeenCalled();
  });

  it("rejects anything that isn't exactly a prefs object", async () => {
    requireOwner.mockResolvedValue(owner);
    for (const bad of [
      { ...GOOD, skin: "neon" },
      { ...GOOD, accent: "#A855F7" },
      { ...GOOD, accent: "red;}body{display:none" },
      { ...GOOD, wallpaper: "url(x)" },
      { ...GOOD, extra: 1 },
      null,
    ]) {
      expect(await savePrefs(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(savePrefsStore).not.toHaveBeenCalled();
  });

  it("saves under the session's user, accent or none", async () => {
    requireOwner.mockResolvedValue(owner);
    savePrefsStore.mockResolvedValue(true);
    expect(await savePrefs(GOOD)).toEqual({ ok: true });
    expect(await savePrefs({ ...GOOD, accent: null })).toEqual({ ok: true });
    expect(savePrefsStore).toHaveBeenNthCalledWith(1, "user-1", GOOD);
  });

  it("reports a database failure instead of throwing", async () => {
    requireOwner.mockResolvedValue(owner);
    savePrefsStore.mockRejectedValue(new Error("relation does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await savePrefs(GOOD)).toEqual({ ok: false, reason: "failed" });
  });
});
