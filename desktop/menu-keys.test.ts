import { describe, expect, test } from "vitest";
import { menuKey, type KeyInput } from "./menu-keys";

const down = (code: string, mods: Partial<KeyInput> = {}): KeyInput => ({ type: "keyDown", key: "", code, control: false, shift: false, alt: false, meta: false, ...mods });
const ctrl = { control: true };

describe("menuKey", () => {
  test("the View menu's keys", () => {
    expect(menuKey(down("Equal", ctrl), false)).toBe("zoomIn");
    expect(menuKey(down("Equal", { control: true, shift: true }), false)).toBe("zoomIn");
    expect(menuKey(down("NumpadAdd", ctrl), false)).toBe("zoomIn");
    expect(menuKey(down("Minus", ctrl), false)).toBe("zoomOut");
    expect(menuKey(down("NumpadSubtract", ctrl), false)).toBe("zoomOut");
    expect(menuKey(down("Digit0", ctrl), false)).toBe("resetZoom");
    expect(menuKey(down("KeyR", ctrl), false)).toBe("reload");
    expect(menuKey(down("KeyR", { control: true, shift: true }), false)).toBe("forceReload");
    expect(menuKey(down("F11"), false)).toBe("toggleFullScreen");
  });

  test("dev tools only where they exist", () => {
    expect(menuKey(down("KeyI", { control: true, shift: true }), true)).toBe("toggleDevTools");
    expect(menuKey(down("KeyI", { control: true, shift: true }), false)).toBeNull();
  });

  test("everything else is the page's", () => {
    expect(menuKey(down("KeyK", ctrl), true)).toBeNull();
    expect(menuKey(down("KeyR"), true)).toBeNull();
    expect(menuKey(down("Equal"), true)).toBeNull();
    expect(menuKey(down("Equal", { control: true, alt: true }), true)).toBeNull();
    expect(menuKey(down("Digit0", { control: true, shift: true }), true)).toBeNull();
    expect(menuKey({ ...down("Equal", ctrl), type: "keyUp" }, true)).toBeNull();
    expect(menuKey(down("F11", ctrl), true)).toBeNull();
  });
});
