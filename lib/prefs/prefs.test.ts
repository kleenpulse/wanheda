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
  seedPages,
  wallpaperFor,
  withPageWallpaper,
  WALLPAPER_PAGES,
  type Prefs,
} from "./prefs";
import { prefsSchema } from "./schema";
import { wallpaperPageFor } from "./wallpaper-pages";
import { MODULES, SYSTEM_PAGES } from "@/lib/modules";

const CUSTOM: Prefs = {
  skin: "bench",
  accent: "#12ab9f",
  wallpaper: "contour",
  timerMode: "multiple",
  wallpaperScope: "pages",
  wallpaperCover: "page",
  wallpaperPages: { home: "aurora", money: "stars", settings: "dots" },
  auroraEdge: "bottom",
};

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

  it("defaults a bad aurora edge on its own", () => {
    expect(parsePrefs({ ...CUSTOM, auroraEdge: "left" })).toEqual({ ...CUSTOM, auroraEdge: "top" });
  });

  it("defaults a bad scope or cover and drops bad page entries one by one", () => {
    expect(parsePrefs({ ...CUSTOM, wallpaperScope: "some", wallpaperCover: 1 })).toEqual({ ...CUSTOM, wallpaperScope: "home", wallpaperCover: "sheet" });
    expect(parsePrefs({ ...CUSTOM, wallpaperPages: { home: "aurora", money: "none", notes: "lava", nowhere: "stars" } }).wallpaperPages).toEqual({ home: "aurora" });
    for (const junk of [null, "home-aurora", ["aurora"], 4]) expect(parsePrefs({ ...CUSTOM, wallpaperPages: junk }).wallpaperPages).toEqual({});
  });
});

describe("samePrefs", () => {
  it("compares page maps entry by entry, not by reference", () => {
    expect(samePrefs(CUSTOM, { ...CUSTOM, wallpaperPages: { settings: "dots", money: "stars", home: "aurora" } })).toBe(true);
    expect(samePrefs(CUSTOM, { ...CUSTOM, wallpaperPages: { home: "aurora", money: "stars" } })).toBe(false);
    expect(samePrefs(CUSTOM, { ...CUSTOM, wallpaperCover: "sheet" })).toBe(false);
    expect(samePrefs(CUSTOM, { ...CUSTOM, auroraEdge: "top" })).toBe(false);
  });
});

describe("wallpaperFor", () => {
  const base = { wallpaper: "stars", wallpaperPages: { money: "dots" } } as const;

  it("home scope: Home only", () => {
    expect(wallpaperFor({ ...base, wallpaperScope: "home" }, "home")).toBe("stars");
    expect(wallpaperFor({ ...base, wallpaperScope: "home" }, "money")).toBe("none");
  });

  it("all scope: every page", () => {
    for (const page of WALLPAPER_PAGES) expect(wallpaperFor({ ...base, wallpaperScope: "all" }, page)).toBe("stars");
  });

  it("pages scope: the page's own entry, none when it has none", () => {
    expect(wallpaperFor({ ...base, wallpaperScope: "pages" }, "money")).toBe("dots");
    expect(wallpaperFor({ ...base, wallpaperScope: "pages" }, "home")).toBe("none");
  });

  it("a route no page owns wears none", () => {
    expect(wallpaperFor({ ...base, wallpaperScope: "all" }, null)).toBe("none");
  });
});

describe("withPageWallpaper", () => {
  it("sets one page, removes it for none, and never touches the input", () => {
    const pages = { home: "aurora", money: "stars" } as const;
    expect(withPageWallpaper(pages, "notes", "dots")).toEqual({ home: "aurora", money: "stars", notes: "dots" });
    expect(withPageWallpaper(pages, "money", "none")).toEqual({ home: "aurora" });
    expect(pages).toEqual({ home: "aurora", money: "stars" });
  });
});

describe("seedPages", () => {
  it("seeds an empty map from what shows now", () => {
    expect(seedPages({ wallpaper: "aurora", wallpaperScope: "home", wallpaperPages: {} })).toEqual({ home: "aurora" });
    const all = seedPages({ wallpaper: "aurora", wallpaperScope: "all", wallpaperPages: {} });
    expect(WALLPAPER_PAGES.every((page) => all[page] === "aurora")).toBe(true);
    expect(seedPages({ wallpaper: "none", wallpaperScope: "all", wallpaperPages: {} })).toEqual({});
  });

  it("keeps picks already made (pages → all → pages)", () => {
    const picks = { notes: "contour" } as const;
    expect(seedPages({ wallpaper: "aurora", wallpaperScope: "all", wallpaperPages: picks })).toBe(picks);
  });
});

describe("wallpaperPageFor", () => {
  it("maps routes and their children to pages, and anything else to null", () => {
    expect(wallpaperPageFor("/")).toBe("home");
    expect(wallpaperPageFor("/money/subscriptions")).toBe("money");
    expect(wallpaperPageFor("/settings")).toBe("settings");
    expect(wallpaperPageFor("/moneyx")).toBeNull();
    expect(wallpaperPageFor(null)).toBeNull();
  });

  it("covers every app and system page, so a new one is never left out", () => {
    expect([...WALLPAPER_PAGES].sort()).toEqual([...MODULES, ...SYSTEM_PAGES].map((m) => m.id).sort());
  });
});

describe("prefsSchema", () => {
  it("takes the whole row with a partial page map", () => {
    expect(prefsSchema.safeParse(CUSTOM).success).toBe(true);
    expect(prefsSchema.safeParse(DEFAULT_PREFS).success).toBe(true);
  });

  it("rejects none, unknown pages and extra keys", () => {
    expect(prefsSchema.safeParse({ ...CUSTOM, wallpaperPages: { home: "none" } }).success).toBe(false);
    expect(prefsSchema.safeParse({ ...CUSTOM, wallpaperPages: { nowhere: "stars" } }).success).toBe(false);
    expect(prefsSchema.safeParse({ ...CUSTOM, extra: 1 }).success).toBe(false);
    expect(prefsSchema.safeParse({ ...CUSTOM, auroraEdge: "left" }).success).toBe(false);
  });
});

describe("the prefs cookie", () => {
  it("round-trips", () => {
    expect(decodePrefs(encodePrefs(CUSTOM))).toEqual(CUSTOM);
    expect(decodePrefs(encodePrefs(DEFAULT_PREFS))).toEqual(DEFAULT_PREFS);
    expect(samePrefs(decodePrefs(encodePrefs(CUSTOM)), CUSTOM)).toBe(true);
  });

  it("reads a cookie from before the aurora edge with the top edge", () => {
    expect(decodePrefs("bench.12ab9f.aurora.single.all.page.-").auroraEdge).toBe("top");
    expect(decodePrefs("bench.12ab9f.aurora.single.all.page.-.bottom").auroraEdge).toBe("bottom");
  });

  it("reads a cookie from before the wallpaper fields with their defaults", () => {
    expect(decodePrefs("bench.12ab9f.contour.multiple")).toEqual({
      ...DEFAULT_PREFS,
      skin: "bench",
      accent: "#12ab9f",
      wallpaper: "contour",
      timerMode: "multiple",
    });
  });

  it("decodes junk or nothing to defaults", () => {
    expect(decodePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(decodePrefs("a.b.c.d.e")).toEqual(DEFAULT_PREFS);
    expect(decodePrefs("a.b.c.d.e.f.g-h_i")).toEqual(DEFAULT_PREFS);
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
