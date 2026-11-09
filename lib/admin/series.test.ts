import { describe, expect, it } from "vitest";
import { fillDays, lastDays, utcDay } from "./series";

describe("utcDay", () => {
  it("is the UTC date, not the local one", () => {
    expect(utcDay(new Date("2026-11-09T23:30:00-05:00"))).toBe("2026-11-10");
  });
});

describe("lastDays", () => {
  it("lists the days ending today, oldest first, across a month end", () => {
    expect(lastDays(new Date("2026-11-02T08:00:00Z"), 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("is empty for a count of zero or less", () => {
    expect(lastDays(new Date("2026-11-02T08:00:00Z"), 0)).toEqual([]);
    expect(lastDays(new Date("2026-11-02T08:00:00Z"), -3)).toEqual([]);
  });
});

describe("fillDays", () => {
  const days = ["2026-11-01", "2026-11-02", "2026-11-03"];

  it("fills gaps with zero and keeps the day order", () => {
    expect(fillDays(days, [{ day: "2026-11-03", count: 2 }])).toEqual([
      { day: "2026-11-01", count: 0 },
      { day: "2026-11-02", count: 0 },
      { day: "2026-11-03", count: 2 },
    ]);
  });

  it("ignores rows outside the range and adds up repeats", () => {
    expect(
      fillDays(days, [
        { day: "2026-10-31", count: 9 },
        { day: "2026-11-02", count: 1 },
        { day: "2026-11-02", count: 2 },
      ]).map((d) => d.count),
    ).toEqual([0, 3, 0]);
  });
});
