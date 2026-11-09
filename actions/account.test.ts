import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

const requireOwner = vi.fn();
const deleteUser = vi.fn();
const getAuth = vi.fn();
const reqHeaders = new Headers({ cookie: "session=abc" });
vi.mock("@/lib/auth/owner", () => ({ requireOwner }));
vi.mock("@/lib/auth/server", () => ({ getAuth }));
const deleteCookie = vi.fn();
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(reqHeaders), cookies: () => Promise.resolve({ delete: deleteCookie }) }));

const { deleteAccount } = await import("./account");

const owner = { kind: "owner", user: { id: "user-1", email: "Ada@Example.test", name: "Ada" }, admin: false };

beforeEach(() => {
  requireOwner.mockReset().mockResolvedValue(owner);
  deleteUser.mockReset().mockResolvedValue({ success: true });
  getAuth.mockReset().mockReturnValue({ api: { deleteUser } });
  deleteCookie.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("deleteAccount", () => {
  it("deletes nothing in demo", async () => {
    requireOwner.mockResolvedValue({ kind: "demo" });
    expect(await deleteAccount({ confirm: "x" })).toEqual({ ok: false, reason: "demo" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses bad shapes and a wrong email", async () => {
    expect(await deleteAccount(null)).toEqual({ ok: false, reason: "invalid" });
    expect(await deleteAccount({ confirm: "ada@example.test", userId: "user-2" })).toEqual({ ok: false, reason: "invalid" });
    expect(await deleteAccount({ confirm: "" })).toEqual({ ok: false, reason: "mismatch" });
    expect(await deleteAccount({ confirm: "eve@example.test" })).toEqual({ ok: false, reason: "mismatch" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the session's user when the email matches, ignoring case and spaces", async () => {
    expect(await deleteAccount({ confirm: "  ada@EXAMPLE.test " })).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith({ headers: reqHeaders, body: {} });
    expect(deleteCookie).toHaveBeenCalledWith("wanheda.last_sign_in");
  });

  it("asks for a fresh sign-in when the session is over a day old", async () => {
    deleteUser.mockRejectedValue(APIError.from("BAD_REQUEST", { code: "SESSION_EXPIRED", message: "Session expired." }));
    expect(await deleteAccount({ confirm: "ada@example.test" })).toEqual({ ok: false, reason: "stale" });
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("fails softly on any other error, or without auth", async () => {
    deleteUser.mockRejectedValue(new Error("db down"));
    expect(await deleteAccount({ confirm: "ada@example.test" })).toEqual({ ok: false, reason: "failed" });
    getAuth.mockReturnValue(null);
    expect(await deleteAccount({ confirm: "ada@example.test" })).toEqual({ ok: false, reason: "failed" });
  });
});
