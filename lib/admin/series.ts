// Pure helpers for the admin page: day keys and gap-free day series.

const DAY_MS = 86_400_000;

/** The UTC day of `at` as `YYYY-MM-DD`. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The `count` UTC days ending on `end`'s day, oldest first. */
export function lastDays(end: Date, count: number): string[] {
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Array.from({ length: Math.max(0, count) }, (_, i) => utcDay(new Date(last - (count - 1 - i) * DAY_MS)));
}

export interface DayCount {
  day: string;
  count: number;
}

/** One point per day in `days`, zero where `rows` has none. Rows outside `days` are ignored. */
export function fillDays(days: readonly string[], rows: readonly DayCount[]): DayCount[] {
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.count);
  return days.map((day) => ({ day, count: byDay.get(day) ?? 0 }));
}
