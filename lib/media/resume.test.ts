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
