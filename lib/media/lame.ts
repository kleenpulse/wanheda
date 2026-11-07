// The MP3 tail trim for gapless playback (V59, ADR-0013). Mediabunny drops an
// MP3's leading delay (negative timestamps) but its duration still counts the
// encoder's padding at the end. LAME records that padding in the extension of
// the Xing/Info frame; the decoder itself adds 529 samples of delay, so the
// samples to cut from the end are max(0, padding − 529). No LAME extension, or
// a zeroed one (Lavc writes padding 0), means nothing to cut.

export const MP3_DECODER_DELAY = 529;

/** Bytes an ID3v2 tag takes at the start of a file (0 when there is none). Needs the first 10 bytes. */
export function id3Size(head: Uint8Array): number {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const b = (i: number) => (head[i] ?? 0) & 0x7f;
  const size = (b(6) << 21) | (b(7) << 14) | (b(8) << 7) | b(9);
  const footer = ((head[5] ?? 0) & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** Where the Xing/Info tag sits after a Layer III frame header, or null when `at` isn't one. */
function xingOffset(bytes: Uint8Array, at: number): number | null {
  const b1 = bytes[at + 1] ?? 0;
  const b3 = bytes[at + 3] ?? 0;
  if (bytes[at] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5, 1 = reserved
  const layer = (b1 >> 1) & 3; // 1 = Layer III
  if (version === 1 || layer !== 1) return null;
  const mono = ((b3 >> 6) & 3) === 3;
  if (version === 3) return mono ? 21 : 36;
  return mono ? 13 : 21;
}

const isTagWord = (bytes: Uint8Array, at: number, word: string) => {
  for (let i = 0; i < word.length; i++) if (bytes[at + i] !== word.charCodeAt(i)) return false;
  return true;
};

const u32 = (bytes: Uint8Array, at: number) => (((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)) >>> 0;

/** An encoder name starts with letters ("LAME", "Lavc", "Lavf", "GOGO"); anything else isn't a LAME extension. */
const hasEncoderName = (bytes: Uint8Array, at: number) => {
  for (let i = 0; i < 4; i++) {
    const c = bytes[at + i] ?? 0;
    if (!((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a))) return false;
  }
  return true;
};

/**
 * The encoder delay and padding from the LAME extension of the first frame's
 * Xing/Info tag. `bytes` starts right after any ID3v2 tag (see `id3Size`);
 * the first frame is looked for within its first 4 KB.
 */
export function lameDelayPadding(bytes: Uint8Array): { delay: number; padding: number } | null {
  const scan = Math.min(bytes.length - 4, 4096);
  for (let at = 0; at < scan; at++) {
    const off = xingOffset(bytes, at);
    if (off === null) continue;
    const tag = at + off;
    if (!isTagWord(bytes, tag, "Xing") && !isTagWord(bytes, tag, "Info")) return null;
    const flags = u32(bytes, tag + 4);
    let p = tag + 8;
    if (flags & 1) p += 4; // frames
    if (flags & 2) p += 4; // bytes
    if (flags & 4) p += 100; // TOC
    if (flags & 8) p += 4; // quality
    if (p + 24 > bytes.length || !hasEncoderName(bytes, p)) return null;
    const a = bytes[p + 21] ?? 0;
    const b = bytes[p + 22] ?? 0;
    const c = bytes[p + 23] ?? 0;
    return { delay: (a << 4) | (b >> 4), padding: ((b & 0x0f) << 8) | c };
  }
  return null;
}

/** Samples to cut from the end of an MP3: max(0, padding − 529); 0 without a LAME extension. */
export function mp3TailSamples(bytes: Uint8Array): number {
  const lame = lameDelayPadding(bytes);
  return lame ? Math.max(0, lame.padding - MP3_DECODER_DELAY) : 0;
}

/**
 * The part of a decoded chunk to play, given the track's playable span
 * [from, end] in seconds: an offset into the chunk and a length, or null when
 * none of it is inside. `from` is where playback starts (0, or a seek), so
 * negative timestamps (the leading delay) are never heard.
 */
export function clipChunk(timestamp: number, duration: number, from: number, end: number): { offset: number; length: number } | null {
  const start = Math.max(timestamp, from, 0);
  const stop = Math.min(timestamp + duration, end);
  if (stop - start <= 1e-9) return null;
  return { offset: start - timestamp, length: stop - start };
}
