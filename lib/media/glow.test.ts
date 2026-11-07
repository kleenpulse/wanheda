import { describe, expect, it } from "vitest";
import { DEFAULT_GLOW, parseGlow, serializeGlow, showsGlow } from "./glow";

describe("music glow pref", () => {
  it("defaults when nothing is stored", () => {
    expect(parseGlow(null)).toEqual(DEFAULT_GLOW);
    expect(serializeGlow(DEFAULT_GLOW)).toBeNull();
  });

  it("round-trips a choice", () => {
    const v = { brightness: "off", movement: "lively" } as const;
    expect(parseGlow(serializeGlow(v))).toEqual(v);
  });

  it("keeps the good half of a damaged value", () => {
    expect(parseGlow("high:wild")).toEqual({ brightness: "high", movement: "medium" });
    expect(parseGlow("dim:calm")).toEqual({ brightness: "medium", movement: "calm" });
    expect(parseGlow("")).toEqual(DEFAULT_GLOW);
  });
});

describe("showsGlow", () => {
  it("draws only behind a song without art, and never when off", () => {
    expect(showsGlow(false, DEFAULT_GLOW)).toBe(true);
    expect(showsGlow(true, DEFAULT_GLOW)).toBe(false);
    expect(showsGlow(false, { brightness: "off", movement: "lively" })).toBe(false);
  });
});
