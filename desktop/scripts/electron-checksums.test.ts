import { describe, expect, test } from "vitest";
import { expectedSha, shasumsEntry } from "./electron-checksums";

const SHA = "a".repeat(64);
const NAME = "electron-v45.2.0-win32-x64.zip";

describe("expectedSha", () => {
  test("reads the entry", () => {
    expect(expectedSha(JSON.stringify({ [NAME]: SHA, other: "b".repeat(64) }), NAME)).toBe(SHA);
  });

  test("missing, malformed or not hex is null", () => {
    expect(expectedSha("{}", NAME)).toBeNull();
    expect(expectedSha("{broken", NAME)).toBeNull();
    expect(expectedSha(JSON.stringify({ [NAME]: "xyz" }), NAME)).toBeNull();
    expect(expectedSha(JSON.stringify({ [NAME]: SHA.toUpperCase() }), NAME)).toBeNull();
  });
});

describe("shasumsEntry", () => {
  test("reads `<hex> *<name>` lines, CRLF too", () => {
    const text = `${"b".repeat(64)} *electron-v45.2.0-linux-x64.zip\r\n${SHA} *${NAME}\r\n`;
    expect(shasumsEntry(text, NAME)).toBe(SHA);
  });

  test("a name that only contains the wanted one doesn't match", () => {
    expect(shasumsEntry(`${SHA} *x-${NAME}\n`, NAME)).toBeNull();
  });
});
