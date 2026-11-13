import { describe, expect, test } from "vitest";
import { devEnv } from "./dev-server";

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

describe("devEnv", () => {
  const env = devEnv(parent, 4123);

  test("passes only the allowlist from the shell, so the repo's .env files fill the rest", () => {
    expect(env.SystemRoot).toBe("C:\\Windows");
    expect(env.Path).toBe("C:\\bin");
    expect(env.TEMP).toBe("C:\\tmp");
    expect(env.LC_ALL).toBe("en_US");
    for (const name of ["NODE_OPTIONS", "DATABASE_URL", "ELECTRON_RUN_AS_NODE", "GITHUB_TOKEN"]) expect(env[name], name).toBeUndefined();
  });

  test("sign-in belongs to the local origin", () => {
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:4123");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:4123");
  });

  test("port and telemetry; no NODE_ENV and no desktop token", () => {
    expect(env.PORT).toBe("4123");
    expect(env.NEXT_TELEMETRY_DISABLED).toBe("1");
    expect(env.NODE_ENV).toBeUndefined();
    expect(Object.keys(env).some((key) => /token/i.test(key))).toBe(false);
  });
});
