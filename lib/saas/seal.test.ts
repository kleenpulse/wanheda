import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { seal, unseal } from "./seal";
import { sealKeyBytes } from "./seal-key";

/** The value, or a failed test. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

vi.mock("server-only", () => ({}));

const key = Uint8Array.from(randomBytes(32));
const other = Uint8Array.from(randomBytes(32));
const ROW = "8a3e8a2e-6f5b-4a8e-9a57-0f2a1c1d9b10";

describe("seal", () => {
  it("opens with the same key and row", () => {
    const blob = seal('{"token":"t"}', ROW, key);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob).not.toContain("token");
    expect(unseal(blob, ROW, key)).toBe('{"token":"t"}');
  });

  it("uses a fresh IV each time", () => {
    expect(seal("x", ROW, key)).not.toBe(seal("x", ROW, key));
  });

  it("refuses another row, another key, a flipped byte and junk", () => {
    const blob = seal("secret", ROW, key);
    expect(unseal(blob, "another-row", key)).toBeNull();
    expect(unseal(blob, ROW, other)).toBeNull();
    const parts = blob.split(".");
    const body = Buffer.from(must(parts[3]), "base64url");
    body[0] = must(body[0]) ^ 1;
    expect(unseal([parts[0], parts[1], parts[2], body.toString("base64url")].join("."), ROW, key)).toBeNull();
    expect(unseal("v2.a.b.c", ROW, key)).toBeNull();
    expect(unseal("not a blob", ROW, key)).toBeNull();
  });
});

describe("sealKeyBytes", () => {
  it("takes 32 bytes of canonical base64 only", () => {
    expect(sealKeyBytes(Buffer.from(key).toString("base64"))).toEqual(key);
    expect(sealKeyBytes(` ${Buffer.from(key).toString("base64")}\n`)).toEqual(key);
    expect(sealKeyBytes(Buffer.from(randomBytes(16)).toString("base64"))).toBeNull();
    expect(sealKeyBytes(Buffer.from(key).toString("base64url"))).toBeNull();
    expect(sealKeyBytes("")).toBeNull();
    expect(sealKeyBytes(undefined)).toBeNull();
  });
});
