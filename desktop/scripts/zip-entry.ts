/*
 * Just enough of the zip format to take one file out of a remote archive with
 * HTTP Range requests (the end record, the central directory, a local
 * header), so a 52 MB entry doesn't cost a 169 MB download on a metered link
 * (ADR-0014). Pure: bytes in, numbers out. No zip64, no encryption, no
 * multi-disk archives: anything like that is refused.
 */

export type ZipEntry = {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  crc32: number;
  compressedSize: number;
  size: number;
  /** Where the entry's local header starts in the archive. */
  localOffset: number;
};

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const U32_MAX = 0xffffffff;

/** The longest tail that can hold the end record: its 22 bytes and a comment of at most 65,535. */
export const EOCD_TAIL_MAX = EOCD_MIN + 0xffff;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Where the central directory is, read from the archive's last bytes. Throws if the end record isn't there or needs zip64. */
export function readEndRecord(tail: Uint8Array): { offset: number; size: number; entries: number } {
  const v = view(tail);
  for (let at = tail.byteLength - EOCD_MIN; at >= 0; at--) {
    if (v.getUint32(at, true) !== EOCD_SIG) continue;
    // The comment must run exactly to the end, or this is a signature inside other data.
    if (at + EOCD_MIN + v.getUint16(at + 20, true) !== tail.byteLength) continue;
    const disk = v.getUint16(at + 4, true);
    const cdDisk = v.getUint16(at + 6, true);
    const entries = v.getUint16(at + 10, true);
    const size = v.getUint32(at + 12, true);
    const offset = v.getUint32(at + 16, true);
    if (disk !== 0 || cdDisk !== 0) throw new Error("multi-disk zip archives aren't supported");
    if (entries === 0xffff || size === U32_MAX || offset === U32_MAX) throw new Error("zip64 archives aren't supported");
    return { offset, size, entries };
  }
  throw new Error("no zip end record found");
}

/** Every entry of a central directory. Throws on anything malformed, encrypted or zip64. */
export function readCentralDirectory(bytes: Uint8Array, entries: number): ZipEntry[] {
  const v = view(bytes);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const out: ZipEntry[] = [];
  let at = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > bytes.byteLength || v.getUint32(at, true) !== CENTRAL_SIG) throw new Error("the zip's central directory is malformed");
    const flags = v.getUint16(at + 8, true);
    const method = v.getUint16(at + 10, true);
    const crc32 = v.getUint32(at + 16, true);
    const compressedSize = v.getUint32(at + 20, true);
    const size = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true);
    const extraLength = v.getUint16(at + 30, true);
    const commentLength = v.getUint16(at + 32, true);
    const localOffset = v.getUint32(at + 42, true);
    const end = at + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error("the zip's central directory is malformed");
    if (flags & 1) throw new Error("encrypted zip entries aren't supported");
    if (compressedSize === U32_MAX || size === U32_MAX || localOffset === U32_MAX) throw new Error("zip64 archives aren't supported");
    out.push({ name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)), method, crc32, compressedSize, size, localOffset });
    at = end;
  }
  return out;
}

/** A local header is 30 bytes, then the name and an extra field; this many bytes always hold all of it for a short name. */
export const LOCAL_HEADER_READ = 30 + 1024;

/** How many bytes after `entry.localOffset` its data starts, read from the local header's first bytes. */
export function localDataStart(header: Uint8Array): number {
  const v = view(header);
  if (header.byteLength < 30 || v.getUint32(0, true) !== LOCAL_SIG) throw new Error("the zip entry's local header is malformed");
  return 30 + v.getUint16(26, true) + v.getUint16(28, true);
}
