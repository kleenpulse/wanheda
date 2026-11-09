import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminEmails, authSettings, gateMode, googleSignIn, has } from "./capabilities";

const VARS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAILS",
] as const;

const DB = { DATABASE_URL: "postgresql://user:pass@ep-quiet-sky-pooler.eu-central-1.aws.neon.tech/neondb" };
const AUTH = {
  BETTER_AUTH_SECRET: "s".repeat(32),
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
};

function setEnv(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const name of VARS) vi.stubEnv(name, values[name] ?? "");
}

// `bun run test` loads .env.local, so every case sets every variable.
beforeEach(() => {
  setEnv({});
});
afterEach(() => vi.unstubAllEnvs());

describe("gateMode", () => {
  it("is demo with no database and no auth", () => {
    expect(gateMode()).toBe("demo");
  });

  it("is locked with a database and no auth", () => {
    setEnv(DB);
    expect(gateMode()).toBe("locked");
  });

  it("is locked with a database and BETTER_AUTH_SECRET unset", () => {
    setEnv({ ...DB, ...AUTH, BETTER_AUTH_SECRET: "" });
    expect(gateMode()).toBe("locked");
  });

  it("is locked with a database and a short secret", () => {
    setEnv({ ...DB, ...AUTH, BETTER_AUTH_SECRET: "too-short" });
    expect(gateMode()).toBe("locked");
  });

  it("is gated with no admin list: anyone may sign up (ADR-0015)", () => {
    setEnv({ ...DB, ...AUTH, ADMIN_EMAILS: " , " });
    expect(gateMode()).toBe("gated");
  });

  it.each(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const)("is locked with a database and %s unset", (name) => {
    setEnv({ ...DB, ...AUTH, [name]: "" });
    expect(gateMode()).toBe("locked");
  });

  it("is gated with a database and full auth", () => {
    setEnv({ ...DB, ...AUTH });
    expect(gateMode()).toBe("gated");
  });

  it("is demo with auth but no database: no real data exists to protect", () => {
    setEnv(AUTH);
    expect(has("auth")).toBe(false);
    expect(gateMode()).toBe("demo");
  });

  it("treats whitespace-only values as unset", () => {
    setEnv({ DATABASE_URL: "   " });
    expect(has("db")).toBe(false);
    expect(gateMode()).toBe("demo");
  });

  it("reads the environment on every call, not at import", () => {
    expect(gateMode()).toBe("demo");
    setEnv({ ...DB, ...AUTH });
    expect(gateMode()).toBe("gated");
  });
});

describe("authSettings", () => {

  it("leaves baseURL undefined when BETTER_AUTH_URL is unset", () => {
    setEnv(AUTH);
    expect(authSettings()?.baseURL).toBeUndefined();
  });
});

describe("adminEmails", () => {
  it("lower-cases the list and reads it on every call", () => {
    setEnv({ ADMIN_EMAILS: " Admin@Example.com ,second@example.com" });
    expect([...adminEmails()]).toEqual(["admin@example.com", "second@example.com"]);
    setEnv({});
    expect(adminEmails().size).toBe(0);
  });
});

describe("files (reader R2, SPEC V38)", () => {
  const R2 = {
    R2_ACCOUNT_ID: "0".repeat(32),
    R2_ACCESS_KEY_ID: "key-id",
    R2_SECRET_ACCESS_KEY: "key-secret",
    R2_BUCKET: "wanheda-reader",
  };
  const NAMES = Object.keys(R2) as (keyof typeof R2)[];
  const stubR2 = (values: Partial<typeof R2>) => {
    for (const name of NAMES) vi.stubEnv(name, values[name] ?? "");
  };

  it("is off with no R2 vars: the reader is local-only", () => {
    setEnv(DB);
    stubR2({});
    expect(has("files")).toBe(false);
  });

  it("is off when any one of the four is missing", () => {
    setEnv(DB);
    for (const name of NAMES) {
      stubR2({ ...R2, [name]: "" });
      expect(has("files")).toBe(false);
    }
  });

  it("needs the database too", () => {
    stubR2(R2);
    expect(has("files")).toBe(false);
    setEnv(DB);
    expect(has("files")).toBe(true);
  });
});

describe("Google sign-in", () => {
  const GOOGLE = { GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" };

  it("is offered with full auth and both Google values", () => {
    setEnv({ ...DB, ...AUTH, ...GOOGLE });
    expect(googleSignIn()).toBe(true);
    expect(authSettings()?.google).toEqual({ clientId: "g-id", clientSecret: "g-secret" });
  });

  it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const)("is off with %s unset, and GitHub still works", (name) => {
    setEnv({ ...DB, ...AUTH, ...GOOGLE, [name]: "" });
    expect(googleSignIn()).toBe(false);
    expect(authSettings()?.google).toBeNull();
    expect(gateMode()).toBe("gated");
  });

  it("does not stand in for GitHub: Google alone leaves Wanheda locked", () => {
    setEnv({ ...DB, ...AUTH, ...GOOGLE, GITHUB_CLIENT_ID: "" });
    expect(gateMode()).toBe("locked");
    expect(googleSignIn()).toBe(false);
  });

  it("is off in demo, where nobody signs in", () => {
    setEnv({ ...AUTH, ...GOOGLE });
    expect(googleSignIn()).toBe(false);
  });
});
