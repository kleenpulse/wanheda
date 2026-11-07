import { describe, expect, it } from "vitest";
import { DEFAULT_VOLUME, nudgeVolume, parseVolume, serializeVolume, volumeGain, WHEEL_STEP, wheelSteps } from "./volume";

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

  it("turns wheel deltas into steps: a notch is one, a trackpad adds up, a turn back starts afresh", () => {
    expect(wheelSteps(0, -100, 0)).toEqual({ steps: 1, carry: 0 });
    expect(wheelSteps(0, 100, 0)).toEqual({ steps: -1, carry: 0 });
    expect(wheelSteps(0, -300, 0)).toEqual({ steps: 3, carry: 0 });
    // trackpad: 4 × 30 px up = 1 step, 20 px kept
    let r = { steps: 0, carry: 0 };
    let total = 0;
    for (let i = 0; i < 4; i++) {
      r = wheelSteps(r.carry, -30, 0);
      total += r.steps;
    }
    expect(total).toBe(1);
    expect(r.carry).toBe(20);
    // turning down drops the 20 px kept from going up
    expect(wheelSteps(20, 90, 0)).toEqual({ steps: 0, carry: -90 });
    // lines and pages
    expect(wheelSteps(0, -3, 1)).toEqual({ steps: 1, carry: 20 });
    expect(wheelSteps(0, 1, 2).steps).toBe(-8);
    expect(nudgeVolume({ level: 0.5, muted: false }, 2 * WHEEL_STEP).level).toBe(0.6);
  });
});
