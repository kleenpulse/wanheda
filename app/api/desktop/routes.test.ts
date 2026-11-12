import { APIError } from "better-auth/api";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The desktop sign-in handoff's two routes (ADR-0016), with Better Auth's
// endpoints faked: what each route checks before it reaches them.

vi.mock("server-only", () => ({}));
const api = { mintDesktopToken: vi.fn(), redeemDesktopToken: vi.fn() };
let configured = true;
vi.mock("@/lib/auth/server", () => ({ getAuth: () => (configured ? { api } : null) }));

const handoff = await import("./handoff/route");
const redeem = await import("./redeem/route");

const ORIGIN = "https://wanheda.example.test";
const N = "n".repeat(43);
const T = "t".repeat(43);

function get(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, { headers });
}

beforeEach(() => {
  configured = true;
  api.mintDesktopToken.mockReset();
  api.redeemDesktopToken.mockReset();
});

describe("GET /api/desktop/handoff", () => {
  it("hands a fresh token to the app with its nonce", async () => {
    api.mintDesktopToken.mockResolvedValue({ token: T });
    const res = await handoff.GET(get(`/api/desktop/handoff?nonce=${N}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`wanheda://auth?token=${T}&nonce=${N}`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("mints nothing for a bad or repeated nonce", async () => {
    for (const query of ["", "?nonce=short", `?nonce=${N}&nonce=${N}`, `?nonce=${N.slice(1)}%26`]) {
      const res = await handoff.GET(get(`/api/desktop/handoff${query}`));
      expect(res.headers.get("location"), query).toBe("/desktop/sign-in");
    }
    expect(api.mintDesktopToken).not.toHaveBeenCalled();
  });

  it("sends a browser without a session to sign in, then back to the page", async () => {
    api.mintDesktopToken.mockRejectedValue(new APIError("UNAUTHORIZED"));
    const res = await handoff.GET(get(`/api/desktop/handoff?nonce=${N}`));
    expect(res.headers.get("location")).toBe(`/login?next=${encodeURIComponent(`/desktop/sign-in?nonce=${N}`)}`);
  });

  it("answers 503 without auth", async () => {
    configured = false;
    expect((await handoff.GET(get(`/api/desktop/handoff?nonce=${N}`))).status).toBe(503);
  });
});

describe("GET /api/desktop/redeem", () => {
  const fromShell = { "x-wanheda-redeem": "1" };

  it("spends the token and opens the app", async () => {
    api.redeemDesktopToken.mockResolvedValue({ ok: true });
    const res = await redeem.GET(get(`/api/desktop/redeem?token=${T}`, fromShell));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(api.redeemDesktopToken).toHaveBeenCalledWith(expect.objectContaining({ body: { token: T } }));
  });

  // Login CSRF: a link elsewhere can't add the header, so a stranger's token is never spent in a browser.
  it("spends nothing without the shell's header", async () => {
    for (const headers of [{}, { "x-wanheda-redeem": "0" }]) {
      const res = await redeem.GET(get(`/api/desktop/redeem?token=${T}`, headers));
      expect(res.headers.get("location")).toBe("/login?error=desktop");
    }
    expect(api.redeemDesktopToken).not.toHaveBeenCalled();
  });

  it("refuses a bad or repeated token, and one Better Auth turns down", async () => {
    for (const query of ["", "?token=short", `?token=${T}&token=${T}`]) {
      const res = await redeem.GET(get(`/api/desktop/redeem${query}`, fromShell));
      expect(res.headers.get("location"), query).toBe("/login?error=desktop");
    }
    expect(api.redeemDesktopToken).not.toHaveBeenCalled();
    api.redeemDesktopToken.mockRejectedValue(new APIError("BAD_REQUEST"));
    const res = await redeem.GET(get(`/api/desktop/redeem?token=${T}`, fromShell));
    expect(res.headers.get("location")).toBe("/login?error=desktop");
  });
});
