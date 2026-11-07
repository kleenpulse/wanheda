import { describe, expect, it } from "vitest";
import { clipChunk, id3Size, lameDelayPadding, mp3TailSamples } from "./lame";

const ascii = (s: string) => new TextEncoder().encode(s);

/** A first MP3 frame with an Info tag and, optionally, a LAME extension. */
function frame({ mono = false, mpeg2 = false, flags = 0x0f, encoder = "LAME3.100", delay = 576, padding = 1234 } = {}): Uint8Array {
  const out = new Uint8Array(512);
  out.set([0xff, mpeg2 ? 0xf3 : 0xfb, 0x90, mono ? 0xc0 : 0x00]);
  const off = mpeg2 ? (mono ? 13 : 21) : mono ? 21 : 36;
  out.set(ascii("Info"), off);
  out.set([0, 0, 0, flags], off + 4);
  let p = off + 8;
  if (flags & 1) p += 4;
  if (flags & 2) p += 4;
  if (flags & 4) p += 100;
  if (flags & 8) p += 4;
  out.set(ascii(encoder), p);
  out.set([delay >> 4, ((delay & 0x0f) << 4) | (padding >> 8), padding & 0xff], p + 21);
  return out;
}

describe("MP3 tail trim (V59)", () => {
  it("reads the encoder delay and padding from the LAME extension", () => {
    expect(lameDelayPadding(frame())).toEqual({ delay: 576, padding: 1234 });
    expect(mp3TailSamples(frame())).toBe(1234 - 529);
  });

  it("finds the tag for mono and MPEG-2 frames, and with fewer Xing fields", () => {
    expect(lameDelayPadding(frame({ mono: true }))?.padding).toBe(1234);
    expect(lameDelayPadding(frame({ mpeg2: true }))?.padding).toBe(1234);
    expect(lameDelayPadding(frame({ mpeg2: true, mono: true, flags: 0x03 }))?.padding).toBe(1234);
  });

  it("cuts nothing without a LAME extension, with a zeroed one, or when padding ≤ the decoder delay", () => {
    expect(mp3TailSamples(frame({ encoder: "\u0000\u0000\u0000\u0000" }))).toBe(0);
    expect(mp3TailSamples(frame({ encoder: "Lavc61.3", delay: 0, padding: 0 }))).toBe(0);
    expect(mp3TailSamples(frame({ padding: 400 }))).toBe(0);
    expect(mp3TailSamples(new Uint8Array(64))).toBe(0);
  });

  it("finds the first frame after leading junk", () => {
    const junk = new Uint8Array(700);
    junk.set(frame(), 100);
    expect(lameDelayPadding(junk)?.padding).toBe(1234);
  });

  it("sizes an ID3v2 tag (syncsafe, with or without a footer)", () => {
    const head = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0x02, 0x01]);
    expect(id3Size(head)).toBe(10 + 257);
    head[5] = 0x10;
    expect(id3Size(head)).toBe(10 + 257 + 10);
    expect(id3Size(new Uint8Array(10))).toBe(0);
  });

  it("clips a chunk to the playable span", () => {
    // The leading delay (negative time) is never heard.
    expect(clipChunk(-0.05, 0.1, 0, 10)).toEqual({ offset: 0.05, length: expect.closeTo(0.05, 9) as number });
    // The tail past the exact end is cut.
    expect(clipChunk(9.95, 0.1, 0, 10)).toEqual({ offset: 0, length: expect.closeTo(0.05, 9) as number });
    // A seek starts inside a chunk.
    expect(clipChunk(4.9, 0.2, 5, 10)).toEqual({ offset: expect.closeTo(0.1, 9) as number, length: expect.closeTo(0.1, 9) as number });
    expect(clipChunk(10, 0.1, 0, 10)).toBeNull();
    expect(clipChunk(-0.2, 0.1, 0, 10)).toBeNull();
  });
});
