import { describe, expect, it } from "vitest";
import { planPlayback, type Probe } from "@/lib/media/ladder";
import { capsFrom, type CapsDeps } from "./media";

// A fake Chrome 2026: plays MP4 and MKV, refuses MPEG-TS; MSE takes H.264, AAC, Opus; never AC3.
const chrome: CapsDeps = {
  canPlayType: (t) => (/^video\/(mp4|x-matroska|webm)|^audio\/(mpeg|wav)/.test(t) && !/ac-3/.test(t) ? "maybe" : ""),
  isTypeSupported: (t) => /codecs="(avc1|mp4a|opus)/.test(t),
  workerMse: true,
};

const track = (id: number, kind: "video" | "audio", codec: string, codecString: string | null) => ({
  id,
  kind,
  codec,
  codecString,
  isDefault: true,
  language: null,
  name: null,
});

const probe = (mime: string, ...tracks: Probe["tracks"]): Probe => ({ format: "x", mime, durationS: 60, tracks });

describe("capsFrom + planPlayback, with a fake Chrome", () => {
  it("MKV H.264 + AAC plays natively", () => {
    const p = probe("video/x-matroska", track(1, "video", "avc", "avc1.64001f"), track(2, "audio", "aac", "mp4a.40.2"));
    expect(planPlayback(p, capsFrom(p, chrome)).mode).toBe("native");
  });

  it("MPEG-TS H.264 + AAC is remuxed", () => {
    const p = probe("video/MP2T", track(1, "video", "avc", "avc1.64001f"), track(2, "audio", "aac", "mp4a.40.2"));
    expect(planPlayback(p, capsFrom(p, chrome)).mode).toBe("remux");
  });

  it("MKV H.264 + AC3 says why instead of playing silent", () => {
    const p = probe("video/x-matroska", track(1, "video", "avc", "avc1.64001f"), track(2, "audio", "ac3", "ac-3"));
    expect(planPlayback(p, capsFrom(p, chrome))).toMatchObject({ mode: "cannot", reason: { codec: "ac3" } });
  });

  it("PCM WAV plays natively without a codec string", () => {
    const p = probe("audio/wav", track(1, "audio", "pcm-s16", null));
    expect(planPlayback(p, capsFrom(p, chrome)).mode).toBe("native");
  });
});
