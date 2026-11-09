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

/** Something that serves byte ranges: a Blob, or a file behind a URL that answers Range requests. */
export type RangeReader = { size: number; read: (start: number, end: number) => Promise<Uint8Array> };

export function blobReader(blob: Blob): RangeReader {
  return { size: blob.size, read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()) };
}

/**
 * A file behind a URL (the desktop app's `wanheda-file:`, V72), `size` bytes
 * long, read with Range requests: never the whole file. `end` is exclusive.
 */
export function urlReader(url: string, size: number, fetcher: typeof fetch = fetch): RangeReader {
  return {
    size,
    read: async (start, end) => {
      if (end <= start) return new Uint8Array(0);
      const res = await fetcher(url, { headers: { range: `bytes=${String(start)}-${String(end - 1)}` } });
      if (!res.ok) throw new Error(`Couldn't read the file (${String(res.status)}).`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // A server that ignored the range sent it all: take the part asked for.
      return res.status === 206 ? bytes : bytes.slice(start, end);
    },
  };
}

/** The bytes hashed: 8-byte big-endian size, the first ≤ 1 MiB, the last ≤ 1 MiB (they overlap below 2 MiB). */
export async function fingerprintInput(source: Blob | RangeReader): Promise<Uint8Array<ArrayBuffer>> {
  const reader = source instanceof Blob ? blobReader(source) : source;
  const size = reader.size;
  const head = await reader.read(0, Math.min(FP_EDGE, size));
  const tail = await reader.read(Math.max(0, size - FP_EDGE), size);
  const out = new Uint8Array(8 + head.length + tail.length);
  out.set(sizeBytes(size), 0);
  out.set(head, 8);
  out.set(tail, 8 + head.length);
  return out;
}

export async function quickFingerprint(source: Blob | RangeReader): Promise<string> {
  const input = await fingerprintInput(source);
  return hex(await crypto.subtle.digest("SHA-256", input));
}
