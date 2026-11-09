import { afterEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const AUTH_ENV = {
  DATABASE_URL: "postgresql://test@127.0.0.1:5432/test",
  BETTER_AUTH_SECRET: "t".repeat(40),
  BETTER_AUTH_URL: "https://wanheda.example.test",
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
};

// The first test pays the cold import of Better Auth, Drizzle and the plugins.
// With the whole suite running in parallel that took over Vitest's 5 s default
// (the intermittent failure noted in the Phase 1 board hand-off).
describe("getAuth", { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when auth is not configured", async () => {
    for (const name of Object.keys(AUTH_ENV)) vi.stubEnv(name, "");
    const { getAuth } = await import("./server");
    expect(getAuth()).toBeNull();
  });

  // A copied database (backup, dump, branch) must never hold a usable GitHub token.
  it("stores OAuth tokens encrypted", async () => {
    for (const [name, value] of Object.entries(AUTH_ENV)) vi.stubEnv(name, value);
    const { getAuth } = await import("./server");
    const auth = getAuth();
    expect(auth).not.toBeNull();
    expect(auth?.options.account.encryptOAuthTokens).toBe(true);
  });

  // V81: the "Last used" badge's cookie, and nextCookies still last (it must see every other plugin's cookies).
  it("records the last sign-in method under Wanheda's cookie name", async () => {
    for (const [name, value] of Object.entries(AUTH_ENV)) vi.stubEnv(name, value);
    const { getAuth } = await import("./server");
    const ids = (getAuth()?.options.plugins ?? []).map((plugin) => plugin.id);
    expect(ids).toContain("last-login-method");
    expect(ids.at(-1)).toBe("next-cookies");
    const last = getAuth()?.options.plugins.find((plugin) => plugin.id === "last-login-method");
    expect(last?.options).toMatchObject({ cookieName: "wanheda.last_sign_in" });
  });

  it("offers Google only when both of its values are set", async () => {
    for (const [name, value] of Object.entries(AUTH_ENV)) vi.stubEnv(name, value);
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    let { getAuth } = await import("./server");
    expect(Object.keys(getAuth()?.options.socialProviders ?? {})).toEqual(["github"]);

    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_ID", "g-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "g-secret");
    ({ getAuth } = await import("./server"));
    const google = getAuth()?.options.socialProviders.google;
    expect(google).toMatchObject({ clientId: "g-id", clientSecret: "g-secret", prompt: "select_account" });
  });

  // V79: deletion runs only through the deleteAccount action, never a direct POST.
  it("enables account deletion but closes its HTTP routes", async () => {
    for (const [name, value] of Object.entries(AUTH_ENV)) vi.stubEnv(name, value);
    const { getAuth } = await import("./server");
    const auth = getAuth();
    expect(auth?.options.user.deleteUser.enabled).toBe(true);
    for (const path of ["/delete-user", "/delete-user/callback?token=x"]) {
      const response = await auth?.handler(
        new Request(`${AUTH_ENV.BETTER_AUTH_URL}/api/auth${path}`, {
          method: path.startsWith("/delete-user/") ? "GET" : "POST",
          headers: { origin: AUTH_ENV.BETTER_AUTH_URL, "content-type": "application/json" },
          body: path.startsWith("/delete-user/") ? null : "{}",
        }),
      );
      expect(response?.status).toBe(404);
    }
  });
});
