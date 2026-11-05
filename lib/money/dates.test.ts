import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayLabel, daysBetween, endOfMonth, isDay, isTimeZone, startOfWeek, todayIn, weekdayOf } from "./dates";

describe("todayIn", () => {
  it("is the owner's calendar day, not the server's", () => {
    // 23:30 UTC on 4 Nov is already 5 Nov in Lagos (UTC+1).
    const now = new Date("2026-11-04T23:30:00Z");
    expect(todayIn("Africa/Lagos", now)).toBe("2026-11-05");
    expect(todayIn("UTC", now)).toBe("2026-11-04");
    expect(todayIn("America/New_York", now)).toBe("2026-11-04");
  });

  it("falls back to Lagos for a bad zone", () => {
    expect(todayIn("Not/AZone", new Date("2026-11-04T23:30:00Z"))).toBe("2026-11-05");
    expect(isTimeZone("Not/AZone")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("calendar maths", () => {
  it("validates days", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-1-01")).toBe(false);
    expect(isDay(20260101)).toBe(false);
  });

  it("adds days and months across edges", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-01");
    expect(addMonths("2026-11-05", 14)).toBe("2028-01-01");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });

  it("starts weeks on Monday", () => {
    expect(weekdayOf("2026-11-02")).toBe(0); // Monday
    expect(weekdayOf("2026-11-08")).toBe(6); // Sunday
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02");
    expect(startOfWeek("2026-11-02")).toBe("2026-11-02");
  });

  it("labels days", () => {
    expect(dayLabel("2026-11-05", "2026-11-05")).toBe("Today");
    expect(dayLabel("2026-11-04", "2026-11-05")).toBe("Yesterday");
    expect(dayLabel("2026-11-02", "2026-11-05")).toBe("Mon 2 Nov");
    expect(dayLabel("2025-12-31", "2026-11-05")).toBe("Wed 31 Dec 2025");
  });
});
