// Calendar days for money (SPEC V27). A txn's day is a plain "YYYY-MM-DD"
// string, never a Date, so no time zone can move it. "Today" is the owner's
// day in their time zone, worked out by this one function on the client and
// on the server alike: the server's own clock day (UTC in fra1) is never used.

export type Day = string; // "YYYY-MM-DD"

export const DEFAULT_TIME_ZONE = "Africa/Lagos";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in "YYYY-MM-DD" form. */
export function isDay(value: unknown): value is Day {
  if (typeof value !== "string") return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day at instant `now` in `timeZone` (bad zone → Africa/Lagos). */
export function todayIn(timeZone: string, now: Date = new Date()): Day {
  const tz = isTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(day: Day): [number, number, number] {
  const m = DAY.exec(day);
  if (!m) throw new Error(`Not a day: ${day}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUtc(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

/** Day arithmetic on the calendar, done in UTC so no DST edge can skip a day. */
export function addDays(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  return fromUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Monday = 0 … Sunday = 6. */
export function weekdayOf(day: Day): number {
  const [y, m, d] = parts(day);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: Day): Day {
  return addDays(day, -weekdayOf(day));
}

export function startOfMonth(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: Day): Day {
  const [y, m] = parts(day);
  return `${day.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

/** First day of the month `n` months away (n may be negative). */
export function addMonths(day: Day, n: number): Day {
  const [y, m] = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: Day, b: Day): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Inclusive range check on day strings (they sort as text). */
export function inRange(day: Day, from: Day, to: Day): boolean {
  return day >= from && day <= to;
}

/** "Today", "Yesterday", "Mon 3 Nov", or with a year when not this year. */
export function dayLabel(day: Day, today: Day): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = parts(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  })
    .format(date)
    .replace(",", "");
}
