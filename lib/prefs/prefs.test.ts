import { describe, expect, it } from "vitest";
import {
  ACCENT_ATTR,
  ACCENT_PRESETS,
  ACCENT_VAR,
  DEFAULT_PREFS,
  PREFS_COOKIE,
  SKIN_ATTR,
  decodePrefs,
  encodePrefs,
  parseAccent,
  parsePrefs,
  prefsBootScript,
  samePrefs,
  type Prefs,
} from "./prefs";

const CUSTOM: Prefs = { skin: "bench", accent: "#12ab9f", wallpaper: "contour", timerMode: "multiple" };

/** The generated <head> script as a function of `document`: what the browser runs inline. */
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluates our own generated script against a stub
const runBoot = new Function("document", prefsBootScript()) as (doc: unknown) => void;

/** Runs the boot script against a stand-in <html> and cookie jar. */
function boot(cookie: string) {
  const attrs = new Map<string, string>();
  const style = new Map<string, string>();
  const documentElement = {
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    style: { setProperty: (k: string, v: string) => style.set(k, v) },
  };
  runBoot({ cookie, documentElement });
  return { attrs, style };
}

describe("parseAccent", () => {
  it("takes six hex digits, any case, and nothing else", () => {
    expect(parseAccent("#A855F7")).toBe("#a855f7");
    expect(parseAccent(" #a855f7 ")).toBe("#a855f7");
    for (const bad of ["a855f7", "#a855f", "#a855f7ff", "red", "#zzzzzz", "#a855f7;color:red", null, 7]) {
      expect(parseAccent(bad)).toBeNull();
    }
  });

  it("accepts every preset", () => {
    for (const p of ACCENT_PRESETS) expect(parseAccent(p.hex)).toBe(p.hex);
  });
});

describe("parsePrefs", () => {
  it("keeps good fields and defaults bad ones, one by one", () => {
    expect(parsePrefs(CUSTOM)).toEqual(CUSTOM);
    expect(parsePrefs({ ...CUSTOM, skin: "neon", wallpaper: 3 })).toEqual({ ...CUSTOM, skin: "default", wallpaper: "none" });
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });
});

describe("the prefs cookie", () => {
  it("round-trips", () => {
    expect(decodePrefs(encodePrefs(CUSTOM))).toEqual(CUSTOM);
    expect(decodePrefs(encodePrefs(DEFAULT_PREFS))).toEqual(DEFAULT_PREFS);
    expect(samePrefs(decodePrefs(encodePrefs(CUSTOM)), CUSTOM)).toBe(true);
  });

  it("decodes junk or nothing to defaults", () => {
    expect(decodePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(decodePrefs("a.b.c.d.e")).toEqual(DEFAULT_PREFS);
  });
});

describe("prefsBootScript", () => {
  it("sets the skin and the accent from a good cookie", () => {
    const { attrs, style } = boot(`other=1; ${PREFS_COOKIE}=${encodePrefs(CUSTOM)}`);
    expect(attrs.get(SKIN_ATTR)).toBe("bench");
    expect(attrs.has(ACCENT_ATTR)).toBe(true);
    expect(style.get(ACCENT_VAR)).toBe("#12ab9f");
  });

  it("sets nothing for the default skin and no accent", () => {
    const { attrs, style } = boot(`${PREFS_COOKIE}=${encodePrefs(DEFAULT_PREFS)}`);
    expect(attrs.size).toBe(0);
    expect(style.size).toBe(0);
  });

  it("ignores a tampered cookie: unknown skin, accent that isn't six hex digits", () => {
    const { attrs, style } = boot(`${PREFS_COOKIE}=evil.12ab9f%3Bbackground:url(x).none.single`);
    expect(attrs.has(SKIN_ATTR)).toBe(false);
    expect(style.size).toBe(0);
    expect(boot(`${PREFS_COOKIE}=bench.12AB9F.none.single`).style.size).toBe(0);
  });

  it("does nothing without the cookie, and never throws", () => {
    expect(boot("").attrs.size).toBe(0);
    expect(() => {
      runBoot({});
    }).not.toThrow();
  });
});
