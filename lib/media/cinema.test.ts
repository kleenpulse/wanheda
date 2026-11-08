import { describe, expect, it } from "vitest";
import { countdownFrom, playerClock, resolutionLabel, shouldOfferNext, timeLeft } from "./cinema";

describe("resolutionLabel", () => {
  it("reads the short side", () => {
    expect(resolutionLabel(3840, 2160)).toBe("4K");
    expect(resolutionLabel(2560, 1440)).toBe("QHD");
    expect(resolutionLabel(1920, 1080)).toBe("HD");
    expect(resolutionLabel(1280, 720)).toBe("HD");
    expect(resolutionLabel(854, 480)).toBeNull();
  });

  it("calls a portrait 1080×1920 clip HD, not 4K", () => {
    expect(resolutionLabel(1080, 1920)).toBe("HD");
    expect(resolutionLabel(2160, 3840)).toBe("4K");
  });

  it("is null before the size is known", () => {
    expect(resolutionLabel(0, 0)).toBeNull();
    expect(resolutionLabel(Number.NaN, 1080)).toBeNull();
  });
});

describe("playerClock", () => {
  it("floors, pads seconds, and adds hours past an hour", () => {
    expect(playerClock(0)).toBe("0:00");
    expect(playerClock(65.9)).toBe("1:05");
    expect(playerClock(3725)).toBe("1:02:05");
    expect(playerClock(30, true)).toBe("-0:30");
    expect(playerClock(Number.NaN)).toBe("0:00");
  });
});

describe("timeLeft", () => {
  it("says it the way a card does", () => {
    expect(timeLeft(0, 45)).toBe("45s left");
    expect(timeLeft(600, 2220)).toBe("27m left");
    expect(timeLeft(0, 4920)).toBe("1h 22m left");
    expect(timeLeft(0, 7200)).toBe("2h left");
    expect(timeLeft(100, 50)).toBe("0s left");
  });
});

describe("shouldOfferNext", () => {
  const o = { t: 0, duration: 600, ended: false, hasNext: true, autoplay: true };
  it("offers the next video in the last 10 s of a long one", () => {
    expect(shouldOfferNext({ ...o, t: 589 })).toBe(false);
    expect(shouldOfferNext({ ...o, t: 590 })).toBe(true);
    expect(shouldOfferNext({ ...o, t: 600, ended: true })).toBe(true);
  });
  it("waits for a short clip (or an unknown length) to end", () => {
    expect(shouldOfferNext({ ...o, duration: 45, t: 40 })).toBe(false);
    expect(shouldOfferNext({ ...o, duration: 45, t: 45, ended: true })).toBe(true);
    expect(shouldOfferNext({ ...o, duration: Number.NaN, t: 40 })).toBe(false);
  });
  it("never offers without a next video or with autoplay off", () => {
    expect(shouldOfferNext({ ...o, t: 595, hasNext: false })).toBe(false);
    expect(shouldOfferNext({ ...o, t: 595, autoplay: false })).toBe(false);
  });
});

describe("countdownFrom", () => {
  it("is what's left, at most 8 and at least 1; 5 after the end", () => {
    expect(countdownFrom(9.6, false)).toBe(8);
    expect(countdownFrom(6.4, false)).toBe(6);
    expect(countdownFrom(0.2, false)).toBe(1);
    expect(countdownFrom(0, true)).toBe(5);
  });
});
