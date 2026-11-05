"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, dayLabel, longDayLabel, monthGrid, monthLabel, shortDayLabel, startOfMonth, startOfWeek, type Day } from "@/lib/money/dates";
import { cn } from "@/lib/utils";

// shadcn's Calendar and date-picker anatomy, built here instead of pulling in
// react-day-picker + date-fns (no new packages while the worm rails stand).
// Days are plain "YYYY-MM-DD" strings, so no time zone can move one (SPEC
// V27); weeks start on Monday. Keyboard as WAI-ARIA's date grid: arrows move
// a day or a week, Home/End the week's ends, PageUp/PageDown a month (Shift:
// a year), Enter or Space picks. One day button is tabbable at a time.

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const NAV =
  "grid size-8 place-items-center rounded-full text-ink-2 outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-foreground/[0.08]";

export function Calendar({
  value,
  onChange,
  today,
  min,
  max,
  className,
  autoFocus,
}: {
  value: Day | null;
  onChange: (day: Day) => void;
  today: Day;
  min?: Day;
  max?: Day;
  className?: string;
  /** Focus the selected (or today's) day on mount: a calendar opened in a popover. */
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = React.useState<Day>(value ?? today);
  const month = startOfMonth(focused);
  const days = monthGrid(month);
  const grid = React.useRef<HTMLTableElement>(null);
  const moved = React.useRef(autoFocus ?? false);

  const allowed = (d: Day) => (!min || d >= min) && (!max || d <= max);
  const clamp = (d: Day) => (min && d < min ? min : max && d > max ? max : d);

  // Keep keyboard focus on the focused day as it moves (and across months).
  React.useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused]);

  const move = (d: Day) => {
    moved.current = true;
    setFocused(clamp(d));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, () => Day> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => startOfWeek(focused),
      End: () => addDays(startOfWeek(focused), 6),
      PageUp: () => sameDayIn(focused, e.shiftKey ? -12 : -1),
      PageDown: () => sameDayIn(focused, e.shiftKey ? 12 : 1),
    };
    const next = step[e.key];
    if (!next) return;
    e.preventDefault();
    move(next());
  };

  return (
    <div className={cn("w-[17.5rem] p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2 pl-2">
        <p aria-live="polite" className="font-display text-[15px] leading-none font-semibold tracking-[-0.01em] text-foreground">
          {monthLabel(month)}
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={NAV}
            aria-label="Previous month"
            disabled={Boolean(min && addDays(month, -1) < min)}
            onClick={() => {
              setFocused(clamp(sameDayIn(focused, -1)));
            }}
          >
            <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className={NAV}
            aria-label="Next month"
            disabled={Boolean(max && addMonths(month, 1) > max)}
            onClick={() => {
              setFocused(clamp(sameDayIn(focused, 1)));
            }}
          >
            <ChevronRight aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <table ref={grid} role="grid" aria-label={monthLabel(month)} onKeyDown={onKeyDown} className="w-full border-separate border-spacing-y-0.5">
        <thead>
          <tr>
            {WEEKDAYS.map((w, i) => (
              <th key={w} scope="col" abbr={WEEKDAY_NAMES[i]} className="readout h-8 text-center font-normal">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <tr key={row}>
              {days.slice(row * 7, row * 7 + 7).map((d) => {
                const outside = d.slice(0, 7) !== month.slice(0, 7);
                const selected = d === value;
                const isToday = d === today;
                return (
                  <td key={d} className="p-0 text-center">
                    <button
                      type="button"
                      data-day={d}
                      tabIndex={d === focused ? 0 : -1}
                      disabled={!allowed(d)}
                      aria-label={`${longDayLabel(d)}${isToday ? ", today" : ""}`}
                      aria-pressed={selected}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => {
                        setFocused(d);
                        onChange(d);
                      }}
                      onFocus={() => {
                        if (d !== focused) setFocused(d);
                      }}
                      className={cn(
                        "tabular relative mx-auto grid size-9 place-items-center rounded-full text-[13px] outline-none transition-colors",
                        "hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-foreground/[0.08]",
                        "disabled:pointer-events-none disabled:opacity-30",
                        outside ? "text-ink-3" : "text-foreground",
                        isToday && !selected && "font-semibold ring-1 ring-border dark:ring-glass-border",
                        selected && "bg-inverse font-semibold text-inverse-foreground hover:bg-inverse/88 dark:hover:bg-inverse/88",
                      )}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same day of the month `n` months away, clamped to that month's end (31 Jan + 1 → 28 Feb). */
function sameDayIn(day: Day, n: number): Day {
  const target = addMonths(day, n);
  const want = Number(day.slice(8));
  const last = Number(addDays(addMonths(target, 1), -1).slice(8));
  return `${target.slice(0, 8)}${String(Math.min(want, last)).padStart(2, "0")}`;
}

const TRIGGER = cn(
  "group/trigger flex h-11 w-full min-w-0 items-center gap-2.5 rounded-[14px] bg-sheet pr-2.5 pl-3 text-left text-[14px] text-foreground ring-1 ring-border outline-none select-none",
  "transition-[box-shadow,background-color] duration-150 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:ring-2 data-[popup-open]:ring-ring",
  "dark:bg-card-nested dark:ring-glass-border dark:hover:bg-accent",
);

/**
 * A field that opens the calendar in a frosted popover (shadcn's date picker).
 * The trigger reads "Today", "Yesterday" or "Mon 2 Nov"; picking a day closes it.
 */
export function DatePicker({
  id,
  value,
  onChange,
  today,
  min,
  max,
  presets = [],
}: {
  id?: string;
  value: Day;
  onChange: (day: Day) => void;
  today: Day;
  min?: Day;
  max?: Day;
  /** Quick picks under the grid, such as Today and Yesterday. */
  presets?: readonly { label: string; day: Day }[];
}) {
  const [open, setOpen] = React.useState(false);
  const pick = (d: Day) => {
    onChange(d);
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger id={id} className={TRIGGER} aria-label={`Day: ${longDayLabel(value)}`}>
        <CalendarDays aria-hidden className="size-4 shrink-0 text-ink-2" strokeWidth={1.75} />
        <span className="tabular min-w-0 flex-1 truncate">{dayLabel(value, today)}</span>
        {value === today || value === addDays(today, -1) ? <span className="readout tabular shrink-0">{shortDayLabel(value)}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" collisionPadding={10} className="z-[200] outline-none">
          <Popover.Popup
            initialFocus={false}
            className={cn(
              "glass-menu origin-(--transform-origin) rounded-[20px] text-foreground shadow-lift outline-none",
              "transition-[opacity,scale,translate] duration-200 ease-out-quint",
              "data-[starting-style]:-translate-y-1 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-100",
              "motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[starting-style]:scale-100",
            )}
          >
            <Calendar value={value} onChange={pick} today={today} autoFocus {...(min ? { min } : {})} {...(max ? { max } : {})} />
            {presets.length > 0 ? (
              <div className="flex gap-1.5 border-t border-border px-3 py-2.5 dark:border-glass-border">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      pick(p.day);
                    }}
                    className={cn(
                      "h-8 rounded-pill px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      p.day === value ? "bg-foreground/[0.08] text-foreground" : "text-ink-2 hover:bg-foreground/[0.06] hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
