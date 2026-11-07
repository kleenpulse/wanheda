import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FP_EDGE, fingerprintInput, quickFingerprint } from "./fingerprint";

function bytes(n: number, seed = 1): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

const blob = (b: Uint8Array) => new Blob([b as Uint8Array<ArrayBuffer>]);

describe("quickFingerprint", () => {
  it("is sha256(size ∥ first 1 MiB ∥ last 1 MiB)", async () => {
    const data = bytes(3 * FP_EDGE + 17);
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(data.length));
    const expected = createHash("sha256")
      .update(size)
      .update(data.subarray(0, FP_EDGE))
      .update(data.subarray(data.length - FP_EDGE))
      .digest("hex");
    expect(await quickFingerprint(blob(data))).toBe(expected);
  });

  it("reads at most 2 MiB plus the size, however large the file", async () => {
    expect((await fingerprintInput(blob(bytes(5 * FP_EDGE)))).length).toBe(8 + 2 * FP_EDGE);
  });

  it("ignores the middle but sees size, head and tail changes", async () => {
    const a = bytes(3 * FP_EDGE);
    const middle = a.slice();
    const mid = Math.floor(a.length / 2);
    middle[mid] = (middle[mid] ?? 0) ^ 0xff;
    const tail = a.slice();
    tail[a.length - 1] = (tail[a.length - 1] ?? 0) ^ 0xff;
    const fa = await quickFingerprint(blob(a));
    expect(await quickFingerprint(blob(middle))).toBe(fa);
    expect(await quickFingerprint(blob(tail))).not.toBe(fa);
    expect(await quickFingerprint(blob(a.subarray(0, a.length - 1)))).not.toBe(fa);
  });

  it("handles small and empty files (head and tail overlap)", async () => {
    expect((await fingerprintInput(blob(bytes(10)))).length).toBe(8 + 10 + 10);
    expect(await quickFingerprint(blob(new Uint8Array(0)))).toMatch(/^[0-9a-f]{64}$/);
  });
});
