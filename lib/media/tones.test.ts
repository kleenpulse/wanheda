import { describe, expect, it } from "vitest";
import { seedTracks } from "./music-seed";
import { fillTone, toneSpec } from "./tones";

const RATE = 8000;

describe("demo tones", () => {
  it("knows every seeded track", () => {
    for (const t of seedTracks()) {
      const spec = toneSpec(t.path);
      if (t.album === "Gapless Run") expect(spec.wave).toBe("chirp");
      else if (t.album === "Pulse Width") expect(spec.wave).toBe("square");
      else expect(spec.wave).toBe("sine");
    }
    expect(toneSpec("tone:Sine Studies/02 Middle C").hz).toBeCloseTo(261.63);
  });

  it("the chirp's parts join without a step: part 1's end runs straight into part 2", () => {
    const one = toneSpec("tone:Gapless Run/01 Chirp, part 1");
    const two = toneSpec("tone:Gapless Run/02 Chirp, part 2");
    const n = 10 * RATE;
    const tail = fillTone(one, n - 2, 2, RATE, 10);
    const head = fillTone(two, 0, 2, RATE, 10);
    const whole = fillTone({ ...one, chirp: one.chirp ? { ...one.chirp } : null, fadeOut: false }, n - 2, 4, RATE, 20);
    expect([...tail, ...head].map((v) => v.toFixed(6))).toEqual([...whole].map((v) => v.toFixed(6)));
    // No fade at the seam.
    expect(one.fadeOut).toBe(false);
    expect(two.fadeIn).toBe(false);
  });

  it("fades a lone tone in and out, and is silent past its end", () => {
    const spec = toneSpec("tone:Sine Studies/01 A 440");
    expect(fillTone(spec, 0, 1, RATE, 1)[0]).toBe(0);
    const end = fillTone(spec, RATE - 1, 3, RATE, 1);
    expect(end[0]).toBeCloseTo(0);
    expect(end[1]).toBe(0);
    expect(Math.max(...fillTone(spec, 1000, 200, RATE, 1).map(Math.abs))).toBeGreaterThan(0.1);
  });
});
