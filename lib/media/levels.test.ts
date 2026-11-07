import { describe, expect, it } from "vitest";
import { REST, autoGain, bandEdges, bandLevels, easeBar, newGain } from "./levels";

describe("equalizer levels", () => {
  it("splits the spectrum into rising, non-empty bands", () => {
    const edges = bandEdges(32);
    expect(edges).toHaveLength(5);
    for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeGreaterThan(edges[i - 1] ?? 0);
    expect(edges.at(-1)).toBeLessThanOrEqual(32);
  });

  it("reads each band mostly by its peak, so one hit isn't averaged away", () => {
    const edges = [1, 2, 4, 8, 16];
    const data = new Uint8Array(32);
    data.fill(255, 1, 2);
    data[4] = 255; // one loud bin in a band of four
    const [a, b, c, d] = bandLevels(data, edges);
    expect(a).toBe(1);
    expect(b).toBe(0);
    expect(c).toBeCloseTo(0.65 + 0.35 / 4);
    expect(d).toBe(0);
  });

  it("auto-gain stretches a narrow wobble across the bar's full height", () => {
    const gain = newGain(1);
    let out: number[] = [];
    // Music that only moves between 0.55 and 0.7 of the byte range.
    for (let i = 0; i < 300; i++) out = autoGain(gain, [i % 2 ? 0.7 : 0.55]);
    const low = autoGain(gain, [0.55])[0] ?? 0;
    const high = autoGain(gain, [0.7])[0] ?? 0;
    expect(low).toBeLessThan(0.15);
    expect(high).toBeGreaterThan(0.9);
    expect(out).toHaveLength(1);
  });

  it("near-silence stays near the floor, not full-height noise", () => {
    const gain = newGain(1);
    let out = 0;
    for (let i = 0; i < 300; i++) out = autoGain(gain, [i % 2 ? 0.02 : 0.0])[0] ?? 0;
    expect(out).toBeLessThan(0.3);
  });

  it("snaps up, drops quickly and rests above zero", () => {
    expect(easeBar(REST, 1)).toBeGreaterThan(0.85);
    const down = easeBar(1, 0);
    expect(down).toBeLessThan(0.8);
    expect(down).toBeGreaterThan(REST);
    let h = 1;
    for (let i = 0; i < 100; i++) h = easeBar(h, 0);
    expect(h).toBeCloseTo(REST, 3);
  });
});
