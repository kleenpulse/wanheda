import { describe, expect, it } from "vitest";
import { decideOwner, decideProxy, isPublicPath, safeNextPath } from "./gate";

const ADMINS: ReadonlySet<string> = new Set(["admin@example.com"]);
const ADMIN = { id: "u1", email: "Admin@Example.com", name: "Admin" };
const STRANGER = { id: "u2", email: "someone@example.com", name: "Someone" };

describe("decideProxy", () => {
  const request = { pathname: "/money", search: "?tab=subs", hasSessionCookie: false };

  it("lets everything through in demo mode", () => {
    expect(decideProxy({ ...request, mode: "demo" })).toEqual({ kind: "pass" });
  });

  it.each(["/", "/money", "/login", "/api/auth/session", "/api/webhooks/polar"])(
    "answers 503 for %s in locked mode",
    (pathname) => {
      expect(decideProxy({ ...request, pathname, mode: "locked", hasSessionCookie: true })).toEqual({
        kind: "unavailable",
      });
    },
  );

  it("sends a cookieless request to /login with the path as next", () => {
    expect(decideProxy({ ...request, mode: "gated" })).toEqual({
      kind: "redirect",
      location: "/login?next=%2Fmoney%3Ftab%3Dsubs",
    });
  });

  it("sends a cookieless request for / to plain /login", () => {
    expect(decideProxy({ mode: "gated", pathname: "/", search: "", hasSessionCookie: false })).toEqual({
      kind: "redirect",
      location: "/login",
    });
  });

  it("passes a request with a session cookie (the server validates it)", () => {
    expect(decideProxy({ ...request, mode: "gated", hasSessionCookie: true })).toEqual({ kind: "pass" });
  });

  it.each(["/login", "/api/auth/callback/github", "/api/webhooks/polar"])(
    "never redirects the public path %s (no loop)",
    (pathname) => {
      expect(decideProxy({ mode: "gated", pathname, search: "", hasSessionCookie: false })).toEqual({
        kind: "pass",
      });
    },
  );
});

describe("isPublicPath", () => {
  it("matches whole segments only", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login/")).toBe(true);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/api/authority")).toBe(false);
    expect(isPublicPath("/api")).toBe(false);
  });

  // ADR-0016: the desktop app's window spends its token signed out; minting needs a session.
  it("opens the desktop redeem route only", () => {
    expect(isPublicPath("/api/desktop/redeem")).toBe(true);
    expect(isPublicPath("/api/desktop/handoff")).toBe(false);
    expect(isPublicPath("/desktop/sign-in")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/money?tab=subs", "/money?tab=subs"],
    ["/reader#page-3", "/reader#page-3"],
    [undefined, "/"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example.com", "/"],
    ["//evil.example.com", "/"],
    ["/\\evil.example.com", "/"],
    ["/.//evil.example.com", "/"],
    ["/a/..//evil.example.com", "/"],
    ["/%2e//evil.example.com", "/"],
    ["money", "/"],
    ["/login", "/"],
    ["/login?next=/login", "/"],
  ])("%s → %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe("decideOwner", () => {
  it("is demo in demo mode, whatever the session", () => {
    expect(decideOwner({ mode: "demo", user: STRANGER, admins: ADMINS })).toEqual({ kind: "demo" });
  });

  it("is locked in locked mode, even for an admin", () => {
    expect(decideOwner({ mode: "locked", user: ADMIN, admins: ADMINS })).toEqual({ kind: "locked" });
  });

  it("is anonymous without a session", () => {
    expect(decideOwner({ mode: "gated", user: null, admins: ADMINS })).toEqual({ kind: "anonymous" });
  });

  it("admits anyone with a valid session to their own data", () => {
    expect(decideOwner({ mode: "gated", user: STRANGER, admins: ADMINS })).toEqual({ kind: "owner", user: STRANGER, admin: false });
  });

  it("marks an admin, case-insensitively", () => {
    expect(decideOwner({ mode: "gated", user: ADMIN, admins: ADMINS })).toEqual({ kind: "owner", user: ADMIN, admin: true });
  });

  it("drops admin at once when the email leaves the list, and keeps the user signed in", () => {
    expect(decideOwner({ mode: "gated", user: ADMIN, admins: new Set() })).toEqual({ kind: "owner", user: ADMIN, admin: false });
  });
});
