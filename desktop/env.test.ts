import { describe, expect, test } from "vitest";
import { IMPORTED_NAMES } from "./env-file";
import { baseEnv, serverEnv } from "./env";

const parent = {
  SystemRoot: "C:\\Windows",
  Path: "C:\\bin",
  TEMP: "C:\\tmp",
  LC_ALL: "en_US",
  NODE_OPTIONS: "--require evil",
  DATABASE_URL: "postgres://from-the-shell",
  ELECTRON_RUN_AS_NODE: "1",
  GITHUB_TOKEN: "secret",
};

describe("baseEnv", () => {
  test("passes only the allowlist", () => {
    expect(baseEnv(parent)).toEqual({ SystemRoot: "C:\\Windows", Path: "C:\\bin", TEMP: "C:\\tmp", LC_ALL: "en_US" });
  });
});

describe("serverEnv", () => {
  const env = serverEnv(parent, { mode: "prod", port: 4123, token: "t".repeat(43), secrets: { DATABASE_URL: "postgres://sealed", ADMIN_EMAILS: "me@example.com" } });

  test("the sealed values, never the shell's", () => {
    expect(env.DATABASE_URL).toBe("postgres://sealed");
    expect(env.ADMIN_EMAILS).toBe("me@example.com");
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  test("every known name is set, empty when not imported", () => {
    for (const name of IMPORTED_NAMES) expect(typeof env[name], name).toBe("string");
    expect(env.R2_BUCKET).toBe("");
  });

  test("sign-in belongs to the local origin", () => {
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:4123");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:4123");
  });

  test("token, port, telemetry and NODE_ENV", () => {
    expect(env.WANHEDA_DESKTOP_TOKEN).toBe("t".repeat(43));
    expect(env.PORT).toBe("4123");
    expect(env.NEXT_TELEMETRY_DISABLED).toBe("1");
    expect(env.NODE_ENV).toBe("production");
    expect(serverEnv(parent, { mode: "dev", port: 1, token: "x", secrets: {} }).NODE_ENV).toBeUndefined();
  });
});
