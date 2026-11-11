/*
 * bun desktop/scripts/fetch-ffmpeg.ts [--full]
 *
 * Puts the pinned ffmpeg (SPEC V74, ../ffmpeg-pin.ts) in desktop/.ffmpeg/:
 * `ffmpeg.exe` and its licence text, nothing else from the build.
 *
 * By default it takes only those two entries out of the release zip with
 * HTTP Range requests: about 55 MB on the wire instead of 169 MB (the link
 * here is metered). An interrupted download carries on from where it stopped.
 * Each file must match the zip's own CRC-32 and then the pinned size and
 * sha256, or it isn't kept.
 *
 * `--full` downloads the whole zip and checks its pinned sha256 as well:
 * the way to cross-check the per-file pins against the release (CI, T81).
 *
 * Windows x64 only, like the rest of Phase 8.
 */
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { crc32, createInflateRaw, inflateRawSync } from "node:zlib";
import { FFMPEG_PIN, ffmpegZipUrl, zipPathOf, type PinnedFile } from "../ffmpeg-pin";
import { EOCD_TAIL_MAX, LOCAL_HEADER_READ, localDataStart, readCentralDirectory, readEndRecord, type ZipEntry } from "./zip-entry";

export const FFMPEG_DIR = join(import.meta.dirname, "..", ".ffmpeg");

const TRIES = 8;

async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/** Whether the kept copy of a pinned file is the pinned one. */
export async function inPlace(file: PinnedFile, dir = FFMPEG_DIR): Promise<boolean> {
  const path = join(dir, file.as);
  try {
    return statSync(path).size === file.size && (await sha256Of(path)) === file.sha256;
  } catch {
    return false;
  }
}

async function ranged(url: string, start: number, end: number): Promise<Response> {
  const res = await fetch(url, { redirect: "follow", headers: { range: `bytes=${String(start)}-${String(end)}` }, signal: AbortSignal.timeout(30 * 60_000) });
  if (res.status !== 206) throw new Error(`the release answered ${String(res.status)} to a range request`);
  return res;
}

async function retrying<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= TRIES) throw err;
      console.log(`fetch-ffmpeg: ${what} failed (${(err as Error).message}); trying again (${String(attempt)}/${String(TRIES - 1)})`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function bytes(url: string, start: number, end: number): Promise<Uint8Array> {
  return retrying("a range read", async () => {
    const got = new Uint8Array(await (await ranged(url, start, end)).arrayBuffer());
    if (got.byteLength !== end - start + 1) throw new Error("a range came back short");
    return got;
  });
}

/** The zip's entries, from its last bytes. */
async function remoteEntries(url: string): Promise<ZipEntry[]> {
  const size = FFMPEG_PIN.zip.size;
  const tailStart = Math.max(0, size - EOCD_TAIL_MAX);
  const tail = await bytes(url, tailStart, size - 1);
  const end = readEndRecord(tail);
  const directory = end.offset >= tailStart ? tail.subarray(end.offset - tailStart, end.offset - tailStart + end.size) : await bytes(url, end.offset, end.offset + end.size - 1);
  return readCentralDirectory(directory, end.entries);
}

function entryFor(entries: readonly ZipEntry[], file: PinnedFile): ZipEntry {
  const entry = entries.find((e) => e.name === zipPathOf(file));
  if (!entry) throw new Error(`the zip has no ${zipPathOf(file)}`);
  if (entry.method !== 8 && entry.method !== 0) throw new Error(`${entry.name} uses a compression this script doesn't read`);
  if (entry.size !== file.size) throw new Error(`${entry.name} is ${String(entry.size)} bytes in the zip, and the pin says ${String(file.size)}`);
  return entry;
}

/** Downloads an entry's compressed bytes to `part`, carrying on from what's already there. */
async function downloadEntry(url: string, entry: ZipEntry, part: string): Promise<void> {
  const header = await bytes(url, entry.localOffset, entry.localOffset + LOCAL_HEADER_READ - 1);
  const dataStart = entry.localOffset + localDataStart(header);
  await retrying(entry.name, async () => {
    let have = existsSync(part) ? statSync(part).size : 0;
    if (have > entry.compressedSize) {
      rmSync(part);
      have = 0;
    }
    if (have === entry.compressedSize) return;
    if (have > 0) console.log(`fetch-ffmpeg: carrying on from ${(have / 1e6).toFixed(1)} MB`);
    const res = await ranged(url, dataStart + have, dataStart + entry.compressedSize - 1);
    if (!res.body) throw new Error("the download has no body");
    let shown = have;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      appendFileSync(part, chunk);
      have += chunk.byteLength;
      if (have - shown >= 5e6) {
        shown = have;
        console.log(`fetch-ffmpeg: ${(have / 1e6).toFixed(0)} of ${(entry.compressedSize / 1e6).toFixed(0)} MB`);
      }
    }
    if (have !== entry.compressedSize) throw new Error("the download stopped early");
  });
}

/** Inflates `part` into `out`, and returns the result's CRC-32, sha256 and size. */
async function inflateTo(entry: ZipEntry, part: string, out: string): Promise<{ crc: number; sha256: string; size: number }> {
  const hash = createHash("sha256");
  let crc = 0;
  let size = 0;
  const packed = createReadStream(part);
  const source = entry.method === 8 ? packed.pipe(createInflateRaw()) : packed;
  packed.on("error", (err) => source.destroy(err));
  source.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    crc = crc32(chunk, crc);
    size += chunk.byteLength;
  });
  await pipeline(source, createWriteStream(out));
  return { crc, sha256: hash.digest("hex"), size };
}

function keepIfPinned(file: PinnedFile, got: { sha256: string; size: number }, tmp: string, dir: string): void {
  if (got.size !== file.size || got.sha256 !== file.sha256) {
    throw new Error(`${file.as} isn't the pinned file: got ${String(got.size)} bytes, sha256 ${got.sha256}; the pin says ${String(file.size)} bytes, ${file.sha256}`);
  }
  renameSync(tmp, join(dir, file.as));
  console.log(`fetch-ffmpeg: ${file.as} is in place (${got.sha256})`);
}

async function fetchRanged(dir: string, missing: readonly PinnedFile[]): Promise<void> {
  const url = ffmpegZipUrl();
  const entries = await remoteEntries(url);
  for (const file of missing) {
    const entry = entryFor(entries, file);
    // Named for the pin, so a download left from an older pin is never carried on.
    const part = join(dir, `${file.as}.${file.sha256.slice(0, 8)}.part`);
    const tmp = join(dir, `${file.as}.tmp`);
    const drop = () => {
      rmSync(part, { force: true });
      rmSync(tmp, { force: true });
    };
    console.log(`fetch-ffmpeg: fetching ${file.path} (${(entry.compressedSize / 1e6).toFixed(1)} MB)`);
    await downloadEntry(url, entry, part);
    const got = await inflateTo(entry, part, tmp).catch((err: unknown) => {
      // Not a deflate stream: the download is bad, so it starts over next time.
      drop();
      throw err;
    });
    if (got.crc !== entry.crc32) {
      drop();
      throw new Error(`${file.as} doesn't match the zip's CRC-32; the download was dropped`);
    }
    try {
      keepIfPinned(file, got, tmp, dir);
    } catch (err) {
      // The bytes are the zip's own (the CRC matched), so the download is kept: correcting a pin costs no second download.
      rmSync(tmp, { force: true });
      throw err;
    }
    rmSync(part, { force: true });
  }
}

async function fetchFull(dir: string): Promise<void> {
  console.log(`fetch-ffmpeg: downloading ${FFMPEG_PIN.zip.name} (${(FFMPEG_PIN.zip.size / 1e6).toFixed(0)} MB)`);
  const zip = await retrying("the zip", async () => {
    const res = await fetch(ffmpegZipUrl(), { redirect: "follow", signal: AbortSignal.timeout(60 * 60_000) });
    if (!res.ok) throw new Error(`the release answered ${String(res.status)}`);
    return new Uint8Array(await res.arrayBuffer());
  });
  const sha = createHash("sha256").update(zip).digest("hex");
  if (zip.byteLength !== FFMPEG_PIN.zip.size || sha !== FFMPEG_PIN.zip.sha256) throw new Error(`the zip isn't the pinned one (sha256 ${sha})`);
  const end = readEndRecord(zip.subarray(Math.max(0, zip.byteLength - EOCD_TAIL_MAX)));
  const entries = readCentralDirectory(zip.subarray(end.offset, end.offset + end.size), end.entries);
  for (const file of FFMPEG_PIN.files) {
    const entry = entryFor(entries, file);
    const start = entry.localOffset + localDataStart(zip.subarray(entry.localOffset, entry.localOffset + LOCAL_HEADER_READ));
    const packed = zip.subarray(start, start + entry.compressedSize);
    const data = entry.method === 8 ? inflateRawSync(packed) : packed;
    if (crc32(data) !== entry.crc32) throw new Error(`${file.as} doesn't match the zip's CRC-32`);
    const tmp = join(dir, `${file.as}.tmp`);
    writeFileSync(tmp, data);
    keepIfPinned(file, { size: data.byteLength, sha256: createHash("sha256").update(data).digest("hex") }, tmp, dir);
  }
}

if (import.meta.main) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    console.error("fetch-ffmpeg: Wanheda's desktop shell builds on Windows x64 only for now.");
    process.exit(1);
  }
  const full = process.argv.includes("--full");
  mkdirSync(FFMPEG_DIR, { recursive: true });
  const missing: PinnedFile[] = [];
  for (const file of FFMPEG_PIN.files) if (!(await inPlace(file))) missing.push(file);
  if (missing.length === 0 && !full) {
    console.log(`fetch-ffmpeg: ffmpeg ${FFMPEG_PIN.version} is already in place.`);
    process.exit(0);
  }
  try {
    if (full) await fetchFull(FFMPEG_DIR);
    else await fetchRanged(FFMPEG_DIR, missing);
  } catch (err) {
    console.error(`fetch-ffmpeg: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`fetch-ffmpeg: ffmpeg ${FFMPEG_PIN.version} is in ${FFMPEG_DIR}`);
}
