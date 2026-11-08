import { describe, expect, it } from "vitest";
import { frameStep, keyAction, type KeyPress } from "./player-keys";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });

describe("keyAction", () => {
  it("maps the player's keys on the player", () => {
    expect(keyAction(press(" "), "player", false)).toEqual({ type: "toggle" });
    expect(keyAction(press("k"), "player", false)).toEqual({ type: "toggle" });
    expect(keyAction(press("j"), "player", false)).toEqual({ type: "seek", by: -10 });
    expect(keyAction(press("ArrowRight"), "player", false)).toEqual({ type: "seek", by: 5 });
    expect(keyAction(press("ArrowUp"), "player", false)).toEqual({ type: "volume", by: 0.05 });
    expect(keyAction(press("4"), "player", false)).toEqual({ type: "jump", fraction: 0.4 });
    expect(keyAction(press("0"), "player", false)).toEqual({ type: "jump", fraction: 0 });
  });

  it("allows Shift (it types < > ? N P) and ignores Ctrl, Alt and Meta", () => {
    expect(keyAction(press(">", { shiftKey: true }), "player", false)).toEqual({ type: "speed", dir: 1 });
    expect(keyAction(press("?", { shiftKey: true }), "player", false)).toEqual({ type: "help" });
    expect(keyAction(press("N", { shiftKey: true }), "player", false)).toEqual({ type: "next" });
    expect(keyAction(press("P", { shiftKey: true }), "player", false)).toEqual({ type: "prev" });
    expect(keyAction(press("k", { ctrlKey: true }), "player", false)).toBeNull();
    expect(keyAction(press("f", { altKey: true }), "player", false)).toBeNull();
    expect(keyAction(press("l", { metaKey: true }), "player", false)).toBeNull();
  });

  it("needs Shift for next and previous (caps lock alone doesn't count)", () => {
    expect(keyAction(press("N"), "player", false)).toBeNull();
    expect(keyAction(press("n"), "player", false)).toBeNull();
  });

  it("leaves a focused button its press, and the arrows to the player (a clicked Pause keeps focus)", () => {
    expect(keyAction(press(" "), "button", true)).toBeNull();
    expect(keyAction(press("Enter"), "button", true)).toBeNull();
    expect(keyAction(press("ArrowLeft"), "button", true)).toEqual({ type: "seek", by: -5 });
    expect(keyAction(press("ArrowUp"), "button", true)).toEqual({ type: "volume", by: 0.05 });
    expect(keyAction(press("k"), "button", false)).toEqual({ type: "toggle" });
  });

  it("leaves a focused slider or the rail its moves too, but not the player's letters", () => {
    expect(keyAction(press(" "), "widget", false)).toBeNull();
    expect(keyAction(press("ArrowLeft"), "widget", false)).toBeNull();
    expect(keyAction(press("ArrowUp"), "widget", false)).toBeNull();
    expect(keyAction(press("Home"), "widget", false)).toBeNull();
    expect(keyAction(press("f"), "widget", false)).toEqual({ type: "fullscreen" });
  });

  it("never acts while typing or outside the player", () => {
    expect(keyAction(press("k"), "text", false)).toBeNull();
    expect(keyAction(press(" "), "outside", false)).toBeNull();
  });

  it("never takes the palette's slash", () => {
    expect(keyAction(press("/"), "player", false)).toBeNull();
  });

  it("steps frames only while paused", () => {
    expect(keyAction(press("."), "player", true)).toEqual({ type: "frame", dir: 1 });
    expect(keyAction(press(","), "player", true)).toEqual({ type: "frame", dir: -1 });
    expect(keyAction(press("."), "player", false)).toBeNull();
  });
});

describe("frameStep", () => {
  it("uses the probe's rate, else 30 fps", () => {
    expect(frameStep(25)).toBeCloseTo(0.04);
    expect(frameStep(null)).toBeCloseTo(1 / 30);
    expect(frameStep(0)).toBeCloseTo(1 / 30);
    expect(frameStep(Number.NaN)).toBeCloseTo(1 / 30);
    expect(frameStep(1000)).toBeCloseTo(1 / 30);
  });
});
