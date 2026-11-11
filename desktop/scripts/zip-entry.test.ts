import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { EOCD_TAIL_MAX, LOCAL_HEADER_READ, localDataStart, readCentralDirectory, readEndRecord } from "./zip-entry";

type Made = { name: string; data: Buffer; stored?: boolean; extra?: number };

/** A small zip, built by hand: local headers and data, the central directory, the end record. */
function zip(files: Made[], comment = ""): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const packed = file.stored ? file.data : deflateRawSync(file.data);
    const extra = Buffer.alloc(file.extra ?? 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.stored ? 0 : 8, 8);
    local.writeUInt32LE(crc32(file.data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(file.stored ? 0 : 8, 10);
    head.writeUInt32LE(crc32(file.data), 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(file.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    locals.push(local, name, extra, packed);
    central.push(head, name);
    offset += 30 + name.length + extra.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([...locals, directory, end, Buffer.from(comment)]);
}

const text = Buffer.from("the quick brown fox ".repeat(200));
const archive = zip([
  { name: "top/bin/tool.exe", data: text, extra: 28 },
  { name: "top/LICENSE.txt", data: Buffer.from("licence"), stored: true },
]);

describe("reading one entry out of a zip", () => {
  test("the end record, the directory and a local header lead to the entry's bytes", () => {
    const end = readEndRecord(archive.subarray(Math.max(0, archive.length - EOCD_TAIL_MAX)));
    expect(end.entries).toBe(2);
    const entries = readCentralDirectory(archive.subarray(end.offset, end.offset + end.size), end.entries);
    expect(entries.map((e) => e.name)).toEqual(["top/bin/tool.exe", "top/LICENSE.txt"]);

    const [tool, licence] = entries;
    if (!tool || !licence) throw new Error("two entries expected");
    // The local header's extra field (28 bytes here) isn't in the directory: it must be read from the header itself.
    const start = tool.localOffset + localDataStart(archive.subarray(tool.localOffset, tool.localOffset + LOCAL_HEADER_READ));
    const data = inflateRawSync(archive.subarray(start, start + tool.compressedSize));
    expect(data.equals(text)).toBe(true);
    expect(crc32(data)).toBe(tool.crc32);
    expect(tool.size).toBe(text.length);

    const at = licence.localOffset + localDataStart(archive.subarray(licence.localOffset, licence.localOffset + LOCAL_HEADER_READ));
    expect(licence.method).toBe(0);
    expect(archive.subarray(at, at + licence.compressedSize).toString()).toBe("licence");
  });

  test("the end record is found behind a comment, even one that holds its signature", () => {
    const tricky = zip([{ name: "a", data: Buffer.from("x") }], "PK\u0005\u0006 not the end record");
    expect(readEndRecord(tricky).entries).toBe(1);
  });

  test("bytes that aren't a zip, a cut directory and a bad local header are refused", () => {
    expect(() => readEndRecord(Buffer.from("not a zip at all, just some text"))).toThrow(/no zip end record/);
    const end = readEndRecord(archive);
    expect(() => readCentralDirectory(archive.subarray(end.offset, end.offset + end.size - 5), end.entries)).toThrow(/malformed/);
    expect(() => localDataStart(archive.subarray(1, 40))).toThrow(/malformed/);
  });

  test("zip64 and encrypted archives are refused, never half read", () => {
    const big = Buffer.from(archive);
    big.writeUInt32LE(0xffffffff, big.length - 22 + 16);
    expect(() => readEndRecord(big)).toThrow(/zip64/);

    const end = readEndRecord(archive);
    const directory = Buffer.from(archive.subarray(end.offset, end.offset + end.size));
    directory.writeUInt16LE(1, 8);
    expect(() => readCentralDirectory(directory, end.entries)).toThrow(/encrypted/);
  });
});
