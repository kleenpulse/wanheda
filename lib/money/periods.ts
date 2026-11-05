import { addDays, addMonths, daysBetween, endOfMonth, isDay, startOfMonth, startOfWeek, type Day } from "./dates";

// Report periods (FR-MONEY-5, SPEC V27): a day, a Monday-first week, a
// calendar month or a custom range, all on plain calendar days. The previous
// period is the same kind immediately before; a custom range's is the same
// length immediately before. Pure, so the client and tests agree.

export const PERIOD_KINDS = ["day", "week", "month", "custom"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface Period {
  kind: PeriodKind;
  from: Day;
  /** Inclusive. */
  to: Day;
}

/** A custom range is at most a year and a day long, so a report never pulls more than that. */
export const CUSTOM_MAX_DAYS = 366;

export function periodAt(kind: Exclude<PeriodKind, "custom">, day: Day): Period {
  if (kind === "day") return { kind, from: day, to: day };
  if (kind === "week") {
    const from = startOfWeek(day);
    return { kind, from, to: addDays(from, 6) };
  }
  return { kind, from: startOfMonth(day), to: endOfMonth(day) };
}

/** A custom range in either order, clamped to CUSTOM_MAX_DAYS ending on the later day. */
export function customPeriod(a: Day, b: Day): Period {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const clamped = lengthOf({ from, to }) > CUSTOM_MAX_DAYS ? addDays(to, -(CUSTOM_MAX_DAYS - 1)) : from;
  return { kind: "custom", from: clamped, to };
}

/** Days in a range, both ends counted. */
export function lengthOf(p: Pick<Period, "from" | "to">): number {
  return daysBetween(p.from, p.to) + 1;
}

export function previousPeriod(p: Period): Period {
  if (p.kind === "custom") {
    const n = lengthOf(p);
    return { kind: "custom", from: addDays(p.from, -n), to: addDays(p.from, -1) };
  }
  if (p.kind === "month") return periodAt("month", addMonths(p.from, -1));
  return periodAt(p.kind, addDays(p.from, -1));
}

export function nextPeriod(p: Period): Period {
  if (p.kind === "custom") {
    const n = lengthOf(p);
    return { kind: "custom", from: addDays(p.to, 1), to: addDays(p.to, n) };
  }
  return periodAt(p.kind, addDays(p.to, 1));
}

export function isCurrent(p: Pick<Period, "from" | "to">, today: Day): boolean {
  return p.from <= today && today <= p.to;
}

/**
 * What a period is compared with. A finished period is set against the whole
 * previous one. One still running is set against the same number of days at
 * the start of the previous one ("1–5 Nov" against "1–5 Oct"), clamped to
 * its end (31 Mar against 1–28 Feb), so a month five days old is never
 * measured against a whole month.
 */
export function comparisonOf(p: Period, today: Day): Period {
  const prev = previousPeriod(p);
  if (!isCurrent(p, today)) return prev;
  const to = addDays(prev.from, daysBetween(p.from, today));
  return { ...prev, to: to < prev.to ? to : prev.to };
}

/** The last day with data to show: today while the period runs, else its end. */
export function endSoFar(p: Pick<Period, "from" | "to">, today: Day): Day {
  return isCurrent(p, today) ? today : p.to;
}

/* --------------------------------------------------------------- URL form */

/**
 * The `?p=` value for a period: null for this month (the default), "today",
 * "week" for the current ones, then "day:2026-11-03", "week:2026-10-26",
 * "month:2026-10" and "2026-10-01..2026-10-20" for the rest.
 */
export function periodParam(p: Period, today: Day): string | null {
  const current = isCurrent(p, today);
  if (p.kind === "month") return current ? null : `month:${p.from.slice(0, 7)}`;
  if (p.kind === "week") return current ? "week" : `week:${p.from}`;
  if (p.kind === "day") return current ? "today" : `day:${p.from}`;
  return `${p.from}..${p.to}`;
}

/** Reads `?p=`. Anything it cannot read is this month, never an error. */
export function parsePeriod(param: string | null | undefined, today: Day): Period {
  const fallback = periodAt("month", today);
  if (!param) return fallback;
  if (param === "today") return periodAt("day", today);
  if (param === "week") return periodAt("week", today);
  if (param === "month") return fallback;
  const range = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(param);
  if (range) {
    const [, a, b] = range;
    return isDay(a) && isDay(b) ? customPeriod(a, b) : fallback;
  }
  const [kind, value] = param.split(":", 2);
  if (kind === "month" && value && /^\d{4}-\d{2}$/.test(value) && isDay(`${value}-01`)) return periodAt("month", `${value}-01`);
  if ((kind === "week" || kind === "day") && isDay(value)) return periodAt(kind, value);
  return fallback;
}

/* ----------------------------------------------------------------- labels */

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });
const DAY_MONTH = fmt({ day: "numeric", month: "short" });
const DAY_MONTH_YEAR = fmt({ day: "numeric", month: "short", year: "numeric" });
const MONTH = fmt({ month: "long" });
const MONTH_YEAR = fmt({ month: "long", year: "numeric" });
const WEEKDAY_DAY_MONTH = fmt({ weekday: "short", day: "numeric", month: "short" });
const date = (d: Day) => new Date(`${d}T00:00:00Z`);

/** "1–5 Nov", "28 Oct – 3 Nov", "28 Dec 2025 – 3 Jan 2026" (the year only when it isn't this year's). */
export function rangeLabel(from: Day, to: Day, today: Day): string {
  const year = today.slice(0, 4);
  const withYear = from.slice(0, 4) !== year || to.slice(0, 4) !== year;
  if (from === to) return (withYear ? DAY_MONTH_YEAR : DAY_MONTH).format(date(from));
  if (from.slice(0, 7) === to.slice(0, 7)) {
    const tail = (withYear ? DAY_MONTH_YEAR : DAY_MONTH).format(date(to));
    return `${String(Number(from.slice(8)))}–${tail}`;
  }
  const f = withYear ? DAY_MONTH_YEAR : DAY_MONTH;
  return `${f.format(date(from))} – ${f.format(date(to))}`;
}

/** The heading for a period: "Today", "This week", "November", "October 2025", "3–9 Nov", "1 Oct – 20 Nov". */
export function periodTitle(p: Period, today: Day): string {
  if (p.kind === "day") {
    if (p.from === today) return "Today";
    if (p.from === addDays(today, -1)) return "Yesterday";
    const label = WEEKDAY_DAY_MONTH.format(date(p.from)).replace(",", "");
    return p.from.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${p.from.slice(0, 4)}`;
  }
  if (p.kind === "week") {
    if (isCurrent(p, today)) return "This week";
    if (isCurrent(p, addDays(today, -7))) return "Last week";
    return rangeLabel(p.from, p.to, today);
  }
  if (p.kind === "month") return (p.from.slice(0, 4) === today.slice(0, 4) ? MONTH : MONTH_YEAR).format(date(p.from));
  return rangeLabel(p.from, p.to, today);
}

/* ---------------------------------------------------------------- buckets */

export type BucketSize = "day" | "week" | "month";

export interface Bucket {
  from: Day;
  to: Day;
}

/** How a period's bars are bucketed: by day up to 62 days, by week up to 26 weeks, else by month. None for a single day. */
export function bucketSizeOf(p: Pick<Period, "kind" | "from" | "to">): BucketSize | null {
  const n = lengthOf(p);
  if (p.kind === "day" || n <= 1) return null;
  if (n <= 62) return "day";
  if (n <= 26 * 7) return "week";
  return "month";
}

/** The period cut into buckets, the first and last clipped to the period. */
export function bucketsOf(p: Pick<Period, "kind" | "from" | "to">): Bucket[] {
  const size = bucketSizeOf(p);
  if (!size) return [{ from: p.from, to: p.to }];
  const out: Bucket[] = [];
  let from = p.from;
  while (from <= p.to) {
    const end = size === "day" ? from : size === "week" ? addDays(startOfWeek(from), 6) : endOfMonth(from);
    const to = end < p.to ? end : p.to;
    out.push({ from, to });
    from = addDays(to, 1);
  }
  return out;
}

/** Every day of a range, in order. */
export function daysOf(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The part of [from, to] older than the loaded window, which has to be read
 * from the server: null when the range lies inside the window. Ends at the
 * range's own end, so an old period never pulls everything up to the window.
 */
export function olderRange(from: Day, to: Day, since: Day): { from: Day; to: Day } | null {
  if (from >= since) return null;
  const beforeWindow = addDays(since, -1);
  return { from, to: to < beforeWindow ? to : beforeWindow };
}
