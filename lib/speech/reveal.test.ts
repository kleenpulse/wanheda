import { describe, expect, it } from "vitest";
import { revealEdge } from "./reveal";

// Ported from companion-tts shared/format.test.ts.

describe("revealEdge", () => {
  it("shows nothing before playback starts", () => {
    expect(revealEdge(0, 100, false)).toBe(0);
  });

  it("latches full on end regardless of frac", () => {
    expect(revealEdge(0, 100, true)).toBe(100);
    expect(revealEdge(0.4, 100, true)).toBe(100);
  });

  it("leads playback by one unit and clamps at total", () => {
    expect(revealEdge(0.5, 100, false)).toBe(51);
    expect(revealEdge(1, 100, false)).toBe(100);
    expect(revealEdge(0.999, 100, false)).toBe(100);
  });

  it("tiny frac reveals the first unit immediately", () => {
    expect(revealEdge(0.0001, 100, false)).toBe(1);
  });

  it("pairs with Array.from so surrogate pairs never split", () => {
    const units = Array.from("hi 🚀 there");
    const shown = units.slice(0, revealEdge(0.35, units.length, false)).join("");
    expect(shown).toBe("hi 🚀");
  });
});
