import { afterEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const AUTH_ENV = {
  DATABASE_URL: "postgresql://test@127.0.0.1:5432/test",
  BETTER_AUTH_SECRET: "t".repeat(40),
  BETTER_AUTH_URL: "https://wanheda.example.test",
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
  OWNER_EMAILS: "owner@example.test",
};

describe("getAuth", () => {
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
});
