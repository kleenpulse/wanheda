import { describe, expect, it } from "vitest";
import { DEFAULT_RESUME_MODE, parseResumeMode, serializeResumeMode } from "./resume-mode";

describe("video resume mode", () => {
  it("defaults to ask, and junk falls back to it", () => {
    expect(DEFAULT_RESUME_MODE).toBe("ask");
    expect(parseResumeMode(null)).toBe("ask");
    expect(parseResumeMode("always")).toBe("ask");
    expect(parseResumeMode(" resume ")).toBe("resume");
    expect(parseResumeMode("start")).toBe("start");
  });

  it("stores only a change from the default", () => {
    expect(serializeResumeMode("ask")).toBeNull();
    expect(serializeResumeMode("start")).toBe("start");
    expect(parseResumeMode(serializeResumeMode("resume"))).toBe("resume");
  });
});
