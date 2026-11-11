import { describe, expect, it } from "vitest";
import { encodeIslandShown, parseIslandShown } from "./shown";

describe("the island's on/off setting", () => {
  it("shows the island unless this device turned it off", () => {
    for (const value of [null, undefined, "", "1", "true", "off", "00"]) expect(parseIslandShown(value)).toBe(true);
    expect(parseIslandShown("0")).toBe(false);
  });

  it("round-trips", () => {
    expect(parseIslandShown(encodeIslandShown(true))).toBe(true);
    expect(parseIslandShown(encodeIslandShown(false))).toBe(false);
  });
});
