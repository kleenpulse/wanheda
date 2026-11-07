import { describe, expect, it } from "vitest";
import { cannotMessage, planPlayback, type PlaybackCaps, type Probe, type ProbeTrack } from "./ladder";

const h264: ProbeTrack = { id: 1, kind: "video", codec: "avc", codecString: "avc1.64001f", isDefault: true, language: null, name: null };
const aac: ProbeTrack = { id: 2, kind: "audio", codec: "aac", codecString: "mp4a.40.2", isDefault: true, language: "en", name: null };
const ac3: ProbeTrack = { id: 2, kind: "audio", codec: "ac3", codecString: "ac-3", isDefault: true, language: "en", name: null };
const aac2nd: ProbeTrack = { id: 3, kind: "audio", codec: "aac", codecString: "mp4a.40.2", isDefault: false, language: "fr", name: "Stereo" };
const hevc: ProbeTrack = { id: 1, kind: "video", codec: "hevc", codecString: "hvc1.1.6.L93.B0", isDefault: true, language: null, name: null };

const probe = (format: string, mime: string, ...tracks: ProbeTrack[]): Probe => ({ format, mime, durationS: 900, tracks });
const yes = { native: true, remux: true };
const remuxOnly = { native: false, remux: true };
const no = { native: false, remux: false };
const caps = (container: boolean, tracks: PlaybackCaps["tracks"], extra: Partial<PlaybackCaps> = {}): PlaybackCaps => ({
  container,
  tracks,
  workerMse: true,
  transcodable: [],
  ...extra,
});

describe("planPlayback", () => {
  const cases: [string, Probe, PlaybackCaps, ReturnType<typeof planPlayback>["mode"]][] = [
    ["MP4 H.264 + AAC", probe("MP4", "video/mp4", h264, aac), caps(true, { 1: yes, 2: yes }), "native"],
    ["MKV H.264 + AAC (Chrome 2026)", probe("Matroska", "video/x-matroska", h264, aac), caps(true, { 1: yes, 2: yes }), "native"],
    ["MPEG-TS H.264 + AAC", probe("MPEG-TS", "video/mp2t", h264, aac), caps(false, { 1: remuxOnly, 2: remuxOnly }), "remux"],
    ["MKV the browser refuses", probe("Matroska", "video/x-matroska", h264, aac), caps(false, { 1: remuxOnly, 2: remuxOnly }), "remux"],
    ["MKV H.264 + AC3: container opens, audio would be silent", probe("Matroska", "video/x-matroska", h264, ac3), caps(true, { 1: yes, 2: no }), "cannot"],
    ["MKV HEVC on a device without HEVC", probe("Matroska", "video/x-matroska", hevc, aac), caps(true, { 1: no, 2: yes }), "cannot"],
    ["audio-only MP3", probe("MP3", "audio/mpeg", { ...aac, id: 1, codec: "mp3", codecString: "mp3" }), caps(true, { 1: yes }), "native"],
    ["video only", probe("WebM", "video/webm", h264), caps(true, { 1: yes }), "native"],
  ];

  it.each(cases)("%s", (_name, p, c, mode) => {
    expect(planPlayback(p, c).mode).toBe(mode);
  });

  it("names the codec and the track when it can't play", () => {
    const plan = planPlayback(probe("Matroska", "video/x-matroska", h264, ac3), caps(true, { 1: yes, 2: no }));
    expect(plan).toEqual({ mode: "cannot", reason: { code: "codec", kind: "audio", codec: "ac3", trackId: 2, trackNumber: 1 } });
    if (plan.mode === "cannot") expect(cannotMessage(plan.reason)).toBe("Audio track 1 is Dolby Digital (AC3), which this browser can't play. Converting it is not built yet.");
  });

  it("remuxes when a non-default audio track is chosen (AC3 default + AAC 2nd)", () => {
    const p = probe("Matroska", "video/x-matroska", h264, ac3, aac2nd);
    const c = caps(true, { 1: yes, 2: no, 3: yes });
    expect(planPlayback(p, c, { audio: 3 })).toEqual({ mode: "remux", video: 1, audio: 3 });
  });

  it("with no choice, skips an unplayable default audio for a playable one", () => {
    const p = probe("Matroska", "video/x-matroska", h264, ac3, aac2nd);
    expect(planPlayback(p, caps(true, { 1: yes, 2: no, 3: yes }))).toEqual({ mode: "remux", video: 1, audio: 3 });
  });

  it("an explicit choice of the unplayable track still says why", () => {
    const p = probe("Matroska", "video/x-matroska", h264, ac3, aac2nd);
    expect(planPlayback(p, caps(true, { 1: yes, 2: no, 3: yes }), { audio: 2 })).toMatchObject({ mode: "cannot", reason: { codec: "ac3" } });
  });

  it("plays natively when the chosen track is the default one", () => {
    const p = probe("Matroska", "video/x-matroska", h264, aac, aac2nd);
    expect(planPlayback(p, caps(true, { 1: yes, 2: yes, 3: yes }), { audio: 2 }).mode).toBe("native");
    expect(planPlayback(p, caps(true, { 1: yes, 2: yes, 3: yes }), { audio: 3 }).mode).toBe("remux");
  });

  it("falls back to remux after a native load error", () => {
    const p = probe("Matroska", "video/x-matroska", h264, aac);
    expect(planPlayback(p, caps(true, { 1: yes, 2: yes }, { nativeFailed: true })).mode).toBe("remux");
  });

  it("transcodes only a codec a transcoder can decode", () => {
    const p = probe("Matroska", "video/x-matroska", h264, ac3);
    expect(planPlayback(p, caps(true, { 1: yes, 2: no }, { transcodable: ["ac3"] }))).toEqual({
      mode: "transcode",
      video: 1,
      audio: 2,
      tracks: [2],
    });
  });

  it("can't remux without MSE in a worker", () => {
    const plan = planPlayback(probe("MPEG-TS", "video/mp2t", h264, aac), caps(false, { 1: remuxOnly, 2: remuxOnly }, { workerMse: false }));
    expect(plan).toEqual({ mode: "cannot", reason: { code: "no-worker-mse" } });
  });

  it("treats a track with no caps as unplayable, and an unknown codec as such", () => {
    const odd: ProbeTrack = { ...aac, codec: null, codecString: null };
    const plan = planPlayback(probe("Matroska", "video/x-matroska", h264, odd), caps(true, { 1: yes }));
    expect(plan).toMatchObject({ mode: "cannot", reason: { code: "codec", codec: "unknown" } });
  });

  it("can't play a file with no video or audio", () => {
    expect(planPlayback(probe("Matroska", "video/x-matroska"), caps(true, {}))).toEqual({ mode: "cannot", reason: { code: "no-tracks" } });
  });

  it("falls back to the default track when the chosen id doesn't exist", () => {
    expect(planPlayback(probe("MP4", "video/mp4", h264, aac), caps(true, { 1: yes, 2: yes }), { audio: 99 }).mode).toBe("native");
  });
});
