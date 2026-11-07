import { describe, expect, it } from "vitest";
import { stepSpeed } from "./player-store";

describe("stepSpeed", () => {
  it("steps through 0.5–2× and stops at the ends", () => {
    expect(stepSpeed(1, 1)).toBe(1.25);
    expect(stepSpeed(1, -1)).toBe(0.75);
    expect(stepSpeed(2, 1)).toBe(2);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
    expect(stepSpeed(1.1, 1)).toBe(1.25);
    expect(stepSpeed(1.1, -1)).toBe(1);
  });
});
