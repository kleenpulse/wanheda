import { describe, expect, it } from "vitest";
import { EMPTY_WINDOWS, isOnTop, lower, raise, sanitizeWindows } from "./state";

const P = { x: 10, y: 20, w: 300, h: 200, snapX: null, snapY: "end" } as const;

describe("raise / lower", () => {
  it("opens a window on top, and raising an open one moves it there without a duplicate", () => {
    expect(raise([], "timer.window")).toEqual(["timer.window"]);
    expect(raise(["timer.window"], "timer.window")).toEqual(["timer.window"]);
    expect(isOnTop(["timer.window"], "timer.window")).toBe(true);
    expect(lower(["timer.window"], "timer.window")).toEqual([]);
  });
});

describe("sanitizeWindows", () => {
  it("keeps known windows and good placements", () => {
    expect(sanitizeWindows({ placements: { "timer.window": P }, open: ["timer.window"] })).toEqual({
      placements: { "timer.window": P },
      open: ["timer.window"],
    });
  });

  it("drops unknown ids, bad rects and duplicates", () => {
    expect(
      sanitizeWindows({
        placements: { "gone.window": P, "timer.window": { x: 1 } },
        open: ["gone.window", "timer.window", "timer.window", 7],
      }),
    ).toEqual({ placements: {}, open: ["timer.window"] });
  });

  it("starts empty from junk", () => {
    expect(sanitizeWindows(undefined)).toEqual(EMPTY_WINDOWS);
    expect(sanitizeWindows("nope")).toEqual(EMPTY_WINDOWS);
    expect(sanitizeWindows({ placements: [], open: "timer.window" })).toEqual(EMPTY_WINDOWS);
  });
});
