import { describe, expect, it } from "vitest";
import { DEFAULT_SOUND_MIX, duckGain, parseSoundMix, rampAt, serializeSoundMix, startPauses, type SoundMix } from "./sound-mix";

describe("Sound setting (V60)", () => {
  it("parses a stored mode and level; junk falls back to the default", () => {
    expect(parseSoundMix(null)).toEqual(DEFAULT_SOUND_MIX);
    expect(parseSoundMix("duck")).toEqual({ mode: "duck", level: 35 });
    expect(parseSoundMix("duck:20")).toEqual({ mode: "duck", level: 20 });
    expect(parseSoundMix("mix:50")).toEqual({ mode: "mix", level: 50 });
    expect(parseSoundMix("duck:33")).toEqual({ mode: "duck", level: 35 });
    expect(parseSoundMix("loud")).toEqual(DEFAULT_SOUND_MIX);
    expect(parseSoundMix("")).toEqual(DEFAULT_SOUND_MIX);
    expect(parseSoundMix("{\"mode\":\"duck\"}")).toEqual(DEFAULT_SOUND_MIX);
  });

  it("round-trips, storing nothing for the default", () => {
    const all: SoundMix[] = [
      { mode: "pause", level: 35 },
      { mode: "pause", level: 50 },
      { mode: "duck", level: 20 },
      { mode: "duck", level: 35 },
      { mode: "mix", level: 50 },
    ];
    for (const v of all) expect(parseSoundMix(serializeSoundMix(v))).toEqual(v);
    expect(serializeSoundMix(DEFAULT_SOUND_MIX)).toBeNull();
  });

  it("who a start pauses", () => {
    expect(startPauses("music", "video", "mix")).toBe(true);
    expect(startPauses("video", "music", "duck")).toBe(true);
    expect(startPauses("speech", "music", "pause")).toBe(true);
    expect(startPauses("speech", "music", "duck")).toBe(false);
    expect(startPauses("music", "speech", "mix")).toBe(false);
    expect(startPauses("music", "music", "pause")).toBe(false);
  });

  it("ducks music and video only under playing speech in duck mode", () => {
    const duck: SoundMix = { mode: "duck", level: 20 };
    expect(duckGain("music", duck, true)).toBe(0.2);
    expect(duckGain("video", duck, true)).toBe(0.2);
    expect(duckGain("music", duck, false)).toBe(1);
    expect(duckGain("speech", duck, true)).toBe(1);
    expect(duckGain("music", { mode: "mix", level: 20 }, true)).toBe(1);
  });

  it("ramps linearly and lands exactly", () => {
    expect(rampAt(1, 0.35, 0.25, 0)).toBe(1);
    expect(rampAt(1, 0.35, 0.25, 0.125)).toBeCloseTo(0.675);
    expect(rampAt(1, 0.35, 0.25, 0.25)).toBe(0.35);
    expect(rampAt(0.35, 1, 0.6, 9)).toBe(1);
    expect(rampAt(0.2, 1, 0, 0)).toBe(1);
  });
});
