import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOwner = vi.fn();
const saveLayouts = vi.fn();
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/board/store", () => ({ saveLayouts }));

const { saveBoard } = await import("./board");

const owner = { kind: "owner", user: { id: "user-1", email: "o@example.test", name: "O" } };

beforeEach(() => {
  requireOwner.mockReset();
  saveLayouts.mockReset();
});

describe("saveBoard", () => {
  it("never saves a demo board", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await saveBoard({ lg: [] })).toEqual({ ok: false, reason: "demo" });
    expect(saveLayouts).not.toHaveBeenCalled();
  });

  it("rejects input that is not a layout map", async () => {
    requireOwner.mockResolvedValue(owner);
    expect(await saveBoard({ lg: "nope" })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveBoard({ xl: [] })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveBoard(null)).toEqual({ ok: false, reason: "invalid" });
    expect(saveLayouts).not.toHaveBeenCalled();
  });

  it("saves the cleaned layouts under the session's user, only for the breakpoints sent", async () => {
    requireOwner.mockResolvedValue(owner);
    saveLayouts.mockResolvedValue(true);
    const result = await saveBoard({
      lg: [
        { i: "home.clock", x: 20, y: 0, w: 99, h: 2 },
        { i: "evil.widget", x: 0, y: 0, w: 1, h: 1 },
      ],
    });
    expect(result).toEqual({ ok: true });
    expect(saveLayouts).toHaveBeenCalledWith("user-1", { lg: [{ i: "home.clock", x: 0, y: 0, w: 12, h: 2 }] });
  });

  it("reports a database failure instead of throwing", async () => {
    requireOwner.mockResolvedValue(owner);
    saveLayouts.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await saveBoard({ sm: [] })).toEqual({ ok: false, reason: "failed" });
  });
});
