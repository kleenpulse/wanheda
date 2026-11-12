import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { desktopHandoff } from "./desktop-handoff";
import { HANDOFF_TTL_SECONDS, isHandoffValue } from "./desktop-link";

// A real Better Auth on the memory adapter: the plugin's endpoints, Better
// Auth's verification table and its signed session cookie, end to end.
function setup() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    secret: "s".repeat(40),
    baseURL: "https://wanheda.example.test",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    telemetry: { enabled: false },
    logger: { disabled: true },
    plugins: [desktopHandoff()],
  });
  return { auth, db };
}

function cookieFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

async function browserSignedIn(auth: ReturnType<typeof setup>["auth"]) {
  const { headers } = await auth.api.signUpEmail({
    body: { email: "owner@example.test", password: "a long test password", name: "Owner" },
    returnHeaders: true,
  });
  return new Headers({ cookie: cookieFrom(headers) });
}

describe("desktopHandoff", { timeout: 30_000 }, () => {
  it("mints a single-use token that gives the app a session of its own", async () => {
    const { auth, db } = setup();
    const browser = await browserSignedIn(auth);
    const browserSession = await auth.api.getSession({ headers: browser });

    const { token } = await auth.api.mintDesktopToken({ headers: browser });
    expect(isHandoffValue(token)).toBe(true);
    // Only a hash is stored.
    expect(JSON.stringify(db.verification)).not.toContain(token);

    const { headers } = await auth.api.redeemDesktopToken({ body: { token }, headers: new Headers({ "user-agent": "Wanheda desktop test" }), returnHeaders: true });
    const app = await auth.api.getSession({ headers: new Headers({ cookie: cookieFrom(headers) }) });
    expect(app?.user.id).toBe(browserSession?.user.id);
    expect(app?.session.id).not.toBe(browserSession?.session.id);
    expect(app?.session.userAgent).toBe("Wanheda desktop test");

    // Spent: a second try fails, and the browser's session is untouched.
    await expect(auth.api.redeemDesktopToken({ body: { token } })).rejects.toThrow();
    expect((await auth.api.getSession({ headers: browser }))?.session.id).toBe(browserSession?.session.id);
  });

  it("refuses to mint without a session", async () => {
    const { auth } = setup();
    await expect(auth.api.mintDesktopToken({ headers: new Headers() })).rejects.toThrow();
  });

  it("refuses unknown, malformed and expired tokens", async () => {
    const { auth } = setup();
    const browser = await browserSignedIn(auth);
    await expect(auth.api.redeemDesktopToken({ body: { token: "A".repeat(43) } })).rejects.toThrow();
    await expect(auth.api.redeemDesktopToken({ body: { token: "short" } })).rejects.toThrow();

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { token } = await auth.api.mintDesktopToken({ headers: browser });
      vi.setSystemTime(Date.now() + (HANDOFF_TTL_SECONDS + 1) * 1000);
      await expect(auth.api.redeemDesktopToken({ body: { token } })).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is not on the HTTP router", async () => {
    const { auth } = setup();
    const browser = await browserSignedIn(auth);
    for (const path of ["/api/auth/mint-desktop-token", "/api/auth/redeem-desktop-token"]) {
      const response = await auth.handler(new Request(`https://wanheda.example.test${path}`, { method: "POST", headers: browser }));
      expect(response.status, path).toBe(404);
    }
  });
});
