import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { IMPORTED_NAMES, KNOWN_ENV_NAMES, knownValues, parseEnvFile, SHELL_OWNED } from "./env-file";

describe("KNOWN_ENV_NAMES", () => {
  test("is exactly the names in .env.example", () => {
    const example = readFileSync(join(import.meta.dirname, "..", ".env.example"), "utf8");
    const names = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
    expect([...KNOWN_ENV_NAMES]).toEqual(names);
  });

  test("the shell owns the URLs; everything else is imported", () => {
    expect([...SHELL_OWNED].sort()).toEqual(["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"]);
    expect(IMPORTED_NAMES).not.toContain("BETTER_AUTH_URL");
    expect(IMPORTED_NAMES).toContain("DATABASE_URL");
  });
});

describe("parseEnvFile", () => {
  test("takes known names, drops the rest and the shell's own", () => {
    const text = [
      "# comment",
      "DATABASE_URL=postgres://u:p@host/db?sslmode=require",
      "export OWNER_EMAILS=me@example.com",
      "BETTER_AUTH_URL=https://wanheda.example",
      "VERCEL_OIDC_TOKEN=abc",
      "NODE_OPTIONS=--require x",
      "",
    ].join("\n");
    const { values, taken, ignored } = parseEnvFile(text);
    expect(values).toEqual({ DATABASE_URL: "postgres://u:p@host/db?sslmode=require", OWNER_EMAILS: "me@example.com" });
    expect(taken).toBe(2);
    expect(ignored).toBe(3);
  });

  test("quotes, inline comments, CRLF, a BOM, and the last line winning", () => {
    const text = String.fromCharCode(0xfeff) + "WEATHER_PLACE=\"Lagos # Island\"\r\nGITHUB_CLIENT_ID=abc # dev app\r\nR2_BUCKET='my-bucket'\r\nGITHUB_CLIENT_ID=def\r\n";
    expect(parseEnvFile(text).values).toEqual({ WEATHER_PLACE: "Lagos # Island", GITHUB_CLIENT_ID: "def", R2_BUCKET: "my-bucket" });
  });

  test("an empty value means not set, and clears an earlier one", () => {
    expect(parseEnvFile("DATABASE_URL=x\nDATABASE_URL=\nR2_BUCKET=").values).toEqual({});
  });

  test("lines that aren't assignments are skipped", () => {
    expect(parseEnvFile("just text\n=x\n1BAD=y").taken).toBe(0);
  });
});

describe("knownValues", () => {
  test("keeps known string values, drops unknown names", () => {
    expect(knownValues({ DATABASE_URL: "x", OTHER: "y", BETTER_AUTH_URL: "z", R2_BUCKET: "" })).toEqual({ DATABASE_URL: "x" });
  });

  test("anything malformed is null", () => {
    expect(knownValues(null)).toBeNull();
    expect(knownValues([])).toBeNull();
    expect(knownValues("x")).toBeNull();
    expect(knownValues({ DATABASE_URL: 1 })).toBeNull();
  });
});
