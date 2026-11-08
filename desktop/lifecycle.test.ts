import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasTray, onAllWindowsClosed, onWindowClose, showTrayHint, type Lifecycle } from "./lifecycle";
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from "./settings";

const state = (over: Partial<Lifecycle> = {}): Lifecycle => ({ keepRunning: true, quitting: false, platform: "win32", ...over });

describe("closing the window", () => {
  test("hides it while keep-running is on, on every OS", () => {
    for (const platform of ["win32", "linux", "darwin"] as const) expect(onWindowClose(state({ platform }))).toBe("hide");
  });

  test("closes it when keep-running is off", () => {
    expect(onWindowClose(state({ keepRunning: false }))).toBe("close");
  });

  test("always closes once quitting has started", () => {
    expect(onWindowClose(state({ quitting: true }))).toBe("close");
    expect(onWindowClose(state({ quitting: true, platform: "darwin" }))).toBe("close");
  });
});

describe("after the last window closed", () => {
  test("Windows and Linux quit unless keep-running holds them", () => {
    expect(onAllWindowsClosed(state({ keepRunning: false }))).toBe("quit");
    expect(onAllWindowsClosed(state({ platform: "linux", keepRunning: false }))).toBe("quit");
    expect(onAllWindowsClosed(state())).toBe("stay");
    expect(onAllWindowsClosed(state({ quitting: true }))).toBe("quit");
  });

  test("macOS stays in the Dock", () => {
    expect(onAllWindowsClosed(state({ platform: "darwin", keepRunning: false }))).toBe("stay");
  });
});

describe("tray", () => {
  test("Windows and Linux only", () => {
    expect(hasTray("win32")).toBe(true);
    expect(hasTray("linux")).toBe(true);
    expect(hasTray("darwin")).toBe(false);
  });

  test("the hint shows once, on the first hide, where there is a tray", () => {
    expect(showTrayHint(state(), "hide", false)).toBe(true);
    expect(showTrayHint(state(), "hide", true)).toBe(false);
    expect(showTrayHint(state(), "close", false)).toBe(false);
    expect(showTrayHint(state({ platform: "darwin" }), "hide", false)).toBe(false);
  });
});

describe("settings", () => {
  test("defaults: keep running, no hint yet", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ keepRunning: true, trayHintShown: false, shortcuts: { capture: "Ctrl+Shift+Space", palette: "Alt+Space" } });
  });

  test("keeps known keys of the right type, ignores the rest", () => {
    expect(parseSettings('{"keepRunning":false,"trayHintShown":true,"extra":1}')).toEqual({ keepRunning: false, trayHintShown: true, shortcuts: { capture: "Ctrl+Shift+Space", palette: "Alt+Space" } });
    expect(parseSettings('{"keepRunning":"no"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[]")).toEqual(DEFAULT_SETTINGS);
  });

  test("shortcuts: turned off stays off, a broken one falls back to its default", () => {
    expect(parseSettings('{"shortcuts":{"capture":null,"palette":"alt+p"}}').shortcuts).toEqual({ capture: null, palette: "Alt+P" });
    expect(parseSettings('{"shortcuts":{"capture":"Shift+A","palette":5}}').shortcuts).toEqual({ capture: "Ctrl+Shift+Space", palette: "Alt+Space" });
    expect(parseSettings('{"shortcuts":[]}').shortcuts).toEqual({ capture: "Ctrl+Shift+Space", palette: "Alt+Space" });
  });

  test("round trip through settings.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanheda-settings-"));
    try {
      expect(loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
      const saved = { keepRunning: false, trayHintShown: true, shortcuts: { capture: "Ctrl+Alt+N", palette: null } };
      saveSettings(dir, saved);
      expect(loadSettings(dir)).toEqual(saved);
      expect(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"))).toEqual(saved);
      writeFileSync(join(dir, "settings.json"), "{broken");
      expect(loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
