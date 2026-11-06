import { describe, expect, it } from "vitest";
import {
  DEFAULT_READER_PREFS,
  PAPERS,
  READER_PREF_KEYS,
  completeReaderPrefs,
  parseAutoSpeed,
  parsePaper,
  parseReaderPrefs,
  parseTextSize,
  sameReaderPrefs,
  type ReaderPrefs,
} from "./prefs";

const FULL: ReaderPrefs = {
  coverStyle: "title",
  coverFit: "whole",
  bookPages: "single",
  pageTurn: "instant",
  textSize: 1.25,
  paper: "night-amber",
  autoSpeed: 20,
};

describe("reader prefs", () => {
  it("keeps only the valid fields, so a missing one is not mistaken for a default", () => {
    expect(parseReaderPrefs({ coverStyle: "title", coverFit: "squash", textSize: 3, paper: "sky" })).toEqual({ coverStyle: "title", paper: "sky" });
    expect(parseReaderPrefs(null)).toEqual({});
    expect(parseReaderPrefs("title")).toEqual({});
    expect(parseReaderPrefs(FULL)).toEqual(FULL);
  });

  it("reads numbers from the server and the strings localStorage keeps", () => {
    expect(parseTextSize(1.125)).toBe(1.125);
    expect(parseTextSize("1.5")).toBe(1.5);
    expect(parseTextSize("")).toBeNull();
    expect(parseTextSize(null)).toBeNull();
    expect(parseTextSize(1.3)).toBeNull();
    expect(parseAutoSpeed("37.6")).toBe(38);
    expect(parseAutoSpeed(250)).toBe(100);
    expect(parseAutoSpeed(-4)).toBe(0);
    expect(parseAutoSpeed("fast")).toBeNull();
    expect(parseAutoSpeed(null)).toBeNull();
  });

  it("knows every paper, light and dark", () => {
    expect(PAPERS).toHaveLength(12);
    for (const p of PAPERS) expect(parsePaper(p)).toBe(p);
    expect(parsePaper("night-")).toBeNull();
    expect(parsePaper("night-night-sky")).toBeNull();
  });

  it("accepts only a whole set with no extra keys for saving", () => {
    expect(completeReaderPrefs(FULL)).toEqual(FULL);
    expect(completeReaderPrefs(DEFAULT_READER_PREFS)).toEqual(DEFAULT_READER_PREFS);
    const { paper: _, ...missing } = FULL;
    expect(completeReaderPrefs(missing)).toBeNull();
    expect(completeReaderPrefs({ ...FULL, userId: "someone-else" })).toBeNull();
    expect(completeReaderPrefs({ ...FULL, paper: "neon" })).toBeNull();
    expect(completeReaderPrefs(null)).toBeNull();
  });

  it("compares field by field", () => {
    expect(sameReaderPrefs(FULL, { ...FULL })).toBe(true);
    expect(sameReaderPrefs(FULL, { ...FULL, autoSpeed: 21 })).toBe(false);
    expect(READER_PREF_KEYS).toHaveLength(Object.keys(DEFAULT_READER_PREFS).length);
  });
});
