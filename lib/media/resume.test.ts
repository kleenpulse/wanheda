import { describe, expect, it } from "vitest";
import { isWatched, newestState, resumeAt } from "./resume";

describe("resume rules", () => {
  it("resumes only inside (10 s, duration − 30 s)", () => {
    const s = (positionS: number) => ({ positionS, watched: false });
    expect(resumeAt(s(5), 600)).toBe(0);
    expect(resumeAt(s(10), 600)).toBe(0);
    expect(resumeAt(s(11), 600)).toBe(11);
    expect(resumeAt(s(569), 600)).toBe(569);
    expect(resumeAt(s(570), 600)).toBe(0);
    expect(resumeAt(s(300), null)).toBe(300);
    expect(resumeAt(s(Number.NaN), 600)).toBe(0);
    expect(resumeAt(null, 600)).toBe(0);
  });

  it("a short clip's cut-offs shrink to 10 % of its length", () => {
    const s = (positionS: number) => ({ positionS, watched: false });
    // 20 s: (2 s, 18 s)
    expect(resumeAt(s(2), 20)).toBe(0);
    expect(resumeAt(s(5), 20)).toBe(5);
    expect(resumeAt(s(17.9), 20)).toBe(17.9);
    expect(resumeAt(s(18), 20)).toBe(0);
    // 52 s: (5.2 s, 46.8 s)
    expect(resumeAt(s(5), 52)).toBe(0);
    expect(resumeAt(s(6), 52)).toBe(6);
    expect(resumeAt(s(46), 52)).toBe(46);
    expect(resumeAt(s(47), 52)).toBe(0);
    // 100 s: (10 s, 90 s). The full 30 s tail holds from 300 s.
    expect(resumeAt(s(9), 100)).toBe(0);
    expect(resumeAt(s(11), 100)).toBe(11);
    expect(resumeAt(s(89), 100)).toBe(89);
    expect(resumeAt(s(90), 100)).toBe(0);
  });

  it("a watched video reopens from 0", () => {
    expect(resumeAt({ positionS: 200, watched: true }, 600)).toBe(0);
  });

  it("watched at 95 % or at the end", () => {
    expect(isWatched(569, 600)).toBe(false);
    expect(isWatched(570, 600)).toBe(true);
    expect(isWatched(1, 600, true)).toBe(true);
    expect(isWatched(100, null)).toBe(false);
  });

  it("the newest last_played_at wins across devices", () => {
    const a = { lastPlayedAt: "2026-11-07T10:00:00.000Z", positionS: 10 };
    const b = { lastPlayedAt: "2026-11-07T11:00:00.000Z", positionS: 20 };
    expect(newestState(a, b)).toBe(b);
    expect(newestState(b, a)).toBe(b);
    expect(newestState(null, a)).toBe(a);
  });
});
