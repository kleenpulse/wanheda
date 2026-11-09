import { describe, expect, it } from "vitest";
import { parseLastMethod } from "./last-method";

describe("parseLastMethod", () => {
  it("knows the three ways in", () => {
    expect(parseLastMethod("passkey")).toBe("passkey");
    expect(parseLastMethod("github")).toBe("github");
    expect(parseLastMethod("google")).toBe("google");
  });

  it("ignores anything else", () => {
    for (const raw of [undefined, "", "email", "GitHub", "github ", "<script>"]) expect(parseLastMethod(raw), String(raw)).toBeNull();
  });
});
