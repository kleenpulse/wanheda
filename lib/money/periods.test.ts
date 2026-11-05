import { describe, expect, it } from "vitest";
import {
  bucketsOf,
  bucketSizeOf,
  comparisonOf,
  customPeriod,
  CUSTOM_MAX_DAYS,
  daysOf,
  endSoFar,
  lengthOf,
  olderRange,
  nextPeriod,
  parsePeriod,
  periodAt,
  periodParam,
  periodTitle,
  previousPeriod,
  rangeLabel,
} from "./periods";

const TODAY = "2026-11-05"; // a Thursday

describe("periodAt", () => {
  it("cuts weeks Monday to Sunday", () => {
    expect(periodAt("week", TODAY)).toEqual({ kind: "week", from: "2026-11-02", to: "2026-11-08" });
    // A Sunday belongs to the week that started six days before.
    expect(periodAt("week", "2026-11-08")).toEqual({ kind: "week", from: "2026-11-02", to: "2026-11-08" });
    // A week across a year end.
    expect(periodAt("week", "2027-01-01")).toEqual({ kind: "week", from: "2026-12-28", to: "2027-01-03" });
  });

  it("cuts calendar months, leap February included", () => {
    expect(periodAt("month", TODAY)).toEqual({ kind: "month", from: "2026-11-01", to: "2026-11-30" });
    expect(periodAt("month", "2028-02-10")).toEqual({ kind: "month", from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("previous and next", () => {
  it("steps a day, a week and a month back", () => {
    expect(previousPeriod(periodAt("day", "2026-11-01"))).toEqual({ kind: "day", from: "2026-10-31", to: "2026-10-31" });
    expect(previousPeriod(periodAt("week", TODAY))).toEqual({ kind: "week", from: "2026-10-26", to: "2026-11-01" });
    expect(previousPeriod(periodAt("month", "2026-03-31"))).toEqual({ kind: "month", from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod(periodAt("month", "2026-01-15"))).toEqual({ kind: "month", from: "2025-12-01", to: "2025-12-31" });
  });

  it("gives a custom range the same length immediately before", () => {
    const p = customPeriod("2026-10-10", "2026-10-20"); // 11 days
    expect(previousPeriod(p)).toEqual({ kind: "custom", from: "2026-09-29", to: "2026-10-09" });
    expect(nextPeriod(p)).toEqual({ kind: "custom", from: "2026-10-21", to: "2026-10-31" });
    expect(lengthOf(previousPeriod(p))).toBe(11);
  });

  it("steps forward across month ends", () => {
    expect(nextPeriod(periodAt("month", "2026-01-31"))).toEqual({ kind: "month", from: "2026-02-01", to: "2026-02-28" });
    expect(nextPeriod(periodAt("week", "2026-12-30"))).toEqual({ kind: "week", from: "2027-01-04", to: "2027-01-10" });
  });
});

describe("comparisonOf", () => {
  it("compares a running month with the same days of the last one", () => {
    expect(comparisonOf(periodAt("month", TODAY), TODAY)).toEqual({ kind: "month", from: "2026-10-01", to: "2026-10-05" });
  });

  it("clamps to the end of a shorter previous month", () => {
    expect(comparisonOf(periodAt("month", "2026-03-31"), "2026-03-31")).toEqual({ kind: "month", from: "2026-02-01", to: "2026-02-28" });
    expect(comparisonOf(periodAt("month", "2026-03-29"), "2026-03-29")).toEqual({ kind: "month", from: "2026-02-01", to: "2026-02-28" });
    expect(comparisonOf(periodAt("month", "2026-03-28"), "2026-03-28").to).toBe("2026-02-28");
    expect(comparisonOf(periodAt("month", "2026-03-27"), "2026-03-27").to).toBe("2026-02-27");
  });

  it("compares a running week with the same weekdays of last week", () => {
    expect(comparisonOf(periodAt("week", TODAY), TODAY)).toEqual({ kind: "week", from: "2026-10-26", to: "2026-10-29" });
  });

  it("compares a finished period with the whole previous one", () => {
    expect(comparisonOf(periodAt("month", "2026-10-01"), TODAY)).toEqual({ kind: "month", from: "2026-09-01", to: "2026-09-30" });
    expect(comparisonOf(periodAt("day", "2026-11-04"), TODAY)).toEqual({ kind: "day", from: "2026-11-03", to: "2026-11-03" });
  });

  it("compares today with yesterday", () => {
    expect(comparisonOf(periodAt("day", TODAY), TODAY)).toEqual({ kind: "day", from: "2026-11-04", to: "2026-11-04" });
  });
});

describe("customPeriod", () => {
  it("orders its ends and caps its length", () => {
    expect(customPeriod("2026-10-20", "2026-10-10")).toEqual({ kind: "custom", from: "2026-10-10", to: "2026-10-20" });
    const long = customPeriod("2020-01-01", "2026-11-05");
    expect(long.to).toBe("2026-11-05");
    expect(lengthOf(long)).toBe(CUSTOM_MAX_DAYS);
  });
});

describe("?p= round trip", () => {
  const cases = [
    periodAt("month", TODAY),
    periodAt("month", "2026-09-14"),
    periodAt("week", TODAY),
    periodAt("week", "2026-10-28"),
    periodAt("day", TODAY),
    periodAt("day", "2026-10-31"),
    customPeriod("2026-08-01", "2026-11-05"),
  ];
  it.each(cases)("$kind $from..$to", (p) => {
    expect(parsePeriod(periodParam(p, TODAY), TODAY)).toEqual(p);
  });

  it("keeps the URL short for the current ones", () => {
    expect(periodParam(periodAt("month", TODAY), TODAY)).toBeNull();
    expect(periodParam(periodAt("week", TODAY), TODAY)).toBe("week");
    expect(periodParam(periodAt("day", TODAY), TODAY)).toBe("today");
  });

  it("reads junk as this month", () => {
    for (const junk of ["", "nope", "month:2026-13", "day:2026-02-30", "2026-01-01..2026-02-31", "week:", "custom"]) {
      expect(parsePeriod(junk, TODAY)).toEqual(periodAt("month", TODAY));
    }
  });

  it("snaps a week param to its Monday", () => {
    expect(parsePeriod("week:2026-10-29", TODAY)).toEqual({ kind: "week", from: "2026-10-26", to: "2026-11-01" });
  });
});

describe("labels", () => {
  it("names periods the way a person would", () => {
    expect(periodTitle(periodAt("day", TODAY), TODAY)).toBe("Today");
    expect(periodTitle(periodAt("day", "2026-11-04"), TODAY)).toBe("Yesterday");
    expect(periodTitle(periodAt("day", "2026-11-02"), TODAY)).toBe("Mon 2 Nov");
    expect(periodTitle(periodAt("week", TODAY), TODAY)).toBe("This week");
    expect(periodTitle(periodAt("week", "2026-10-28"), TODAY)).toBe("Last week");
    expect(periodTitle(periodAt("week", "2026-10-21"), TODAY)).toBe("19–25 Oct");
    expect(periodTitle(periodAt("month", TODAY), TODAY)).toBe("November");
    expect(periodTitle(periodAt("month", "2025-11-01"), TODAY)).toBe("November 2025");
  });

  it("writes ranges compactly, with years only when needed", () => {
    expect(rangeLabel("2026-11-01", "2026-11-05", TODAY)).toBe("1–5 Nov");
    expect(rangeLabel("2026-10-28", "2026-11-03", TODAY)).toBe("28 Oct – 3 Nov");
    expect(rangeLabel("2025-12-28", "2026-01-03", TODAY)).toBe("28 Dec 2025 – 3 Jan 2026");
  });
});

describe("buckets", () => {
  it("buckets by day, week or month by length", () => {
    expect(bucketSizeOf(periodAt("day", TODAY))).toBeNull();
    expect(bucketSizeOf(periodAt("month", TODAY))).toBe("day");
    expect(bucketSizeOf(customPeriod("2026-08-01", "2026-11-05"))).toBe("week");
    expect(bucketSizeOf(customPeriod("2026-01-01", "2026-11-05"))).toBe("month");
  });

  it("covers every day exactly once, first and last clipped", () => {
    const p = customPeriod("2026-08-05", "2026-11-05");
    const bs = bucketsOf(p);
    expect(bs[0]).toEqual({ from: "2026-08-05", to: "2026-08-09" }); // Wed to Sun
    expect(bs[1]?.from).toBe("2026-08-10");
    expect(bs.at(-1)).toEqual({ from: "2026-11-02", to: "2026-11-05" });
    const days = bs.flatMap((b) => daysOf(b.from, b.to));
    expect(days).toEqual(daysOf(p.from, p.to));

    const m = bucketsOf(customPeriod("2026-01-15", "2026-11-05"));
    expect(m[0]).toEqual({ from: "2026-01-15", to: "2026-01-31" });
    expect(m[1]).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(m.at(-1)).toEqual({ from: "2026-11-01", to: "2026-11-05" });
  });
});

describe("endSoFar", () => {
  it("stops at today while a period runs", () => {
    expect(endSoFar(periodAt("month", TODAY), TODAY)).toBe(TODAY);
    expect(endSoFar(periodAt("month", "2026-10-01"), TODAY)).toBe("2026-10-31");
  });
});

describe("olderRange", () => {
  const SINCE = "2026-09-01";
  it("reads only the period's own days when it is wholly before the window", () => {
    expect(olderRange("2024-07-01", "2024-08-31", SINCE)).toEqual({ from: "2024-07-01", to: "2024-08-31" });
  });
  it("stops at the day before the window when the range crosses into it", () => {
    expect(olderRange("2026-08-01", "2026-09-30", SINCE)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
  it("needs nothing for a range inside the window", () => {
    expect(olderRange(SINCE, "2026-11-05", SINCE)).toBeNull();
    expect(olderRange("2026-10-01", "2026-10-31", SINCE)).toBeNull();
  });
});
