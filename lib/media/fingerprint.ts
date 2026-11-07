// A local file's identity (V54): sha256(size ∥ first 1 MiB ∥ last 1 MiB).
// Reads at most 2 MiB however large the file, so a 4 GB video is O(1). Runs in
// the media worker; pure enough to test in Node (Blob + WebCrypto).

export const FP_EDGE = 1024 * 1024;

function sizeBytes(size: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(size));
  return out;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The bytes hashed: 8-byte big-endian size, the first ≤ 1 MiB, the last ≤ 1 MiB (they overlap below 2 MiB). */
export async function fingerprintInput(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const size = blob.size;
  const head = new Uint8Array(await blob.slice(0, Math.min(FP_EDGE, size)).arrayBuffer());
  const tail = new Uint8Array(await blob.slice(Math.max(0, size - FP_EDGE), size).arrayBuffer());
  const out = new Uint8Array(8 + head.length + tail.length);
  out.set(sizeBytes(size), 0);
  out.set(head, 8);
  out.set(tail, 8 + head.length);
  return out;
}

export async function quickFingerprint(blob: Blob): Promise<string> {
  const input = await fingerprintInput(blob);
  return hex(await crypto.subtle.digest("SHA-256", input));
}
