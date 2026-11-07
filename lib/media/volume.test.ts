import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUME, nudgeVolume, parseVolume, serializeVolume, volumeGain } from "./volume";

describe("music volume", () => {
  it("parses a level with an optional mute; junk is the default", () => {
    expect(parseVolume(null)).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("0.6")).toEqual({ level: 0.6, muted: false });
    expect(parseVolume("0.35m")).toEqual({ level: 0.35, muted: true });
    expect(parseVolume("0")).toEqual({ level: 0, muted: false });
    expect(parseVolume("1.5")).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("-0.2")).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("loud")).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("")).toEqual(DEFAULT_VOLUME);
  });

  it("round-trips and stores nothing for full and unmuted", () => {
    for (const v of [{ level: 0.6, muted: false }, { level: 0.25, muted: true }, { level: 1, muted: true }, { level: 0, muted: false }]) {
      expect(parseVolume(serializeVolume(v))).toEqual(v);
    }
    expect(serializeVolume(DEFAULT_VOLUME)).toBeNull();
  });

  it("the gain is the level squared, 0 when muted", () => {
    expect(volumeGain({ level: 0.5, muted: false })).toBe(0.25);
    expect(volumeGain({ level: 1, muted: false })).toBe(1);
    expect(volumeGain({ level: 0.8, muted: true })).toBe(0);
  });

  it("nudges in clean steps, clamps, and turning up unmutes", () => {
    expect(nudgeVolume({ level: 0.2, muted: false }, 0.1).level).toBe(0.3);
    expect(nudgeVolume({ level: 0.95, muted: false }, 0.1).level).toBe(1);
    expect(nudgeVolume({ level: 0.05, muted: false }, -0.1).level).toBe(0);
    expect(nudgeVolume({ level: 0.5, muted: true }, 0.1)).toEqual({ level: 0.6, muted: false });
    expect(nudgeVolume({ level: 0.5, muted: true }, -0.1).muted).toBe(true);
  });
});
