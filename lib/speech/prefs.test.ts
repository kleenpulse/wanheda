import { describe, expect, it } from "vitest";
import { parseRatePref, parseVoicePref } from "./prefs";
import { CATALOG, DEFAULT_VOICE } from "./voices";

describe("speech prefs", () => {
  it("keeps a catalog voice and falls back to the default for anything else", () => {
    const other = CATALOG.find((v) => v.id !== DEFAULT_VOICE)?.id ?? DEFAULT_VOICE;
    expect(parseVoicePref(other)).toBe(other);
    expect(parseVoicePref(null)).toBe(DEFAULT_VOICE);
    expect(parseVoicePref("en_US-gone-medium")).toBe(DEFAULT_VOICE);
  });

  it("reads a speed within 0.5–2, 1 when it isn't a number", () => {
    expect(parseRatePref("1.5")).toBe(1.5);
    expect(parseRatePref("9")).toBe(2);
    expect(parseRatePref("0.1")).toBe(0.5);
    expect(parseRatePref(null)).toBe(1);
    expect(parseRatePref("")).toBe(1);
    expect(parseRatePref("fast")).toBe(1);
  });
});
