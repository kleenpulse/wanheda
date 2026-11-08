import { describe, expect, test } from "vitest";
import { DEFAULT_SHORTCUTS, MEDIA_KEYS, parseAccelerator, SHORTCUT_IDS } from "./shortcuts";

describe("parseAccelerator", () => {
  test("writes modifiers one way, in one order", () => {
    expect(parseAccelerator("shift+ctrl+space")).toBe("Ctrl+Shift+Space");
    expect(parseAccelerator("CommandOrControl+Alt+n")).toBe("Ctrl+Alt+N");
    expect(parseAccelerator("Meta+Shift+F5")).toBe("Shift+Super+F5");
    expect(parseAccelerator("Alt+Space")).toBe("Alt+Space");
    expect(parseAccelerator("Ctrl+/")).toBe("Ctrl+/");
    expect(parseAccelerator("Ctrl+Plus")).toBe("Ctrl+Plus");
    expect(parseAccelerator("Ctrl+Return")).toBe("Ctrl+Enter");
  });

  test("needs Ctrl, Alt or Super and exactly one key", () => {
    for (const bad of ["Shift+A", "A", "F5", "Ctrl", "Ctrl+Alt", "Ctrl+A+B", "Ctrl+Ctrl+A", "Ctrl++", "Ctrl+F25", "Ctrl+F0", "Ctrl+Escape", "Ctrl+é", "Ctrl+MediaPlayPause", "", " "]) {
      expect(parseAccelerator(bad), bad).toBeNull();
    }
    expect(parseAccelerator(42)).toBeNull();
    expect(parseAccelerator(null)).toBeNull();
    expect(parseAccelerator(`Ctrl+${"A".repeat(50)}`)).toBeNull();
  });

  test("the defaults are valid and different", () => {
    for (const id of SHORTCUT_IDS) expect(parseAccelerator(DEFAULT_SHORTCUTS[id])).toBe(DEFAULT_SHORTCUTS[id]);
    expect(new Set(Object.values(DEFAULT_SHORTCUTS)).size).toBe(SHORTCUT_IDS.length);
  });

  test("the media keys are Electron's names", () => {
    expect(Object.keys(MEDIA_KEYS).sort()).toEqual(["MediaNextTrack", "MediaPlayPause", "MediaPreviousTrack", "MediaStop"]);
  });
});
