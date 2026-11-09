import { describe, expect, it, vi } from "vitest";
import { createServerEnv, PRODUCTION_REQUIRED } from "./server";

const SECRET = "s".repeat(32);

const FULL = {
  DATABASE_URL: "postgresql://user:pass@ep-quiet-sky-pooler.eu-central-1.aws.neon.tech/neondb",
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "https://wanheda.example.com",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
};

// t3-env logs the issues before it throws; keep the test output readable.
function quietly<T>(fn: () => T): T {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

describe("server env schema", () => {
  it("accepts an empty environment (demo mode)", () => {
    const env = createServerEnv({});
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    const env = createServerEnv({ DATABASE_URL: "", ADMIN_EMAILS: "" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.ADMIN_EMAILS).toBeUndefined();
  });

  it("accepts a full production environment", () => {
    const env = createServerEnv({ ...FULL, VERCEL_ENV: "production" });
    expect(env.GITHUB_CLIENT_ID).toBe("client-id");
  });

  it.each(PRODUCTION_REQUIRED)("fails a production build without %s", (name) => {
    const runtime = { ...FULL, VERCEL_ENV: "production", [name]: undefined };
    expect(() => quietly(() => createServerEnv(runtime))).toThrow(name);
  });

  it("does not need ADMIN_EMAILS in production: anyone may sign up (ADR-0015)", () => {
    expect(() => createServerEnv({ ...FULL, VERCEL_ENV: "production" })).not.toThrow();
  });

  it("does not require auth on preview or development deploys", () => {
    expect(() => createServerEnv({ VERCEL_ENV: "preview", DATABASE_URL: FULL.DATABASE_URL })).not.toThrow();
    expect(() => createServerEnv({ VERCEL_ENV: "development" })).not.toThrow();
  });

  it("rejects a secret shorter than 32 characters", () => {
    expect(() => quietly(() => createServerEnv({ BETTER_AUTH_SECRET: "short" }))).toThrow();
  });

  it("rejects malformed values", () => {
    expect(() => quietly(() => createServerEnv({ DATABASE_URL: "not a url" }))).toThrow();
    expect(() => quietly(() => createServerEnv({ ADMIN_EMAILS: "admin@example.com, nope" }))).toThrow();
  });
});
