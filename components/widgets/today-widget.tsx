"use client";

import { Pause, Sunrise, Timer as TimerIcon } from "lucide-react";
import { usePalette } from "@/components/shell/palette-store";
import { buttonClass } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { useActivity } from "@/lib/activity/store";
import { formatClock, isDone, isRunning, remainingMs, type Timer } from "@/lib/activity/timer";
import { WidgetCard } from "./widget-card";

const SECOND = 1000;
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

function status(t: Timer, now: number): string {
  if (isDone(t, now)) return "Done";
  if (!isRunning(t)) return `Paused, ${formatClock(remainingMs(t, now))} left`;
  return `Ends ${clock.format(t.endsAt ?? now)}`;
}

/**
 * Today: the date and what's running on the activity bus. Spend, budgets and
 * renewals are Money's own widgets (T38). The island owns the live countdown,
 * so this only refreshes every few seconds.
 */
export function TodayWidget() {
  const now = useNow(5 * SECOND);
  const timers = useActivity((s) => s.timers);
  const setOpen = usePalette((s) => s.setOpen);

  return (
    <WidgetCard title="Today" icon={Sunrise}>
      <p className="font-display text-kpi-sm text-foreground">{now === null ? " " : day.format(now)}</p>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto scroll-fade">
        <p className="readout">Running</p>
        {now === null || timers.length === 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-ink-2">Nothing running.</p>
            <button
              type="button"
              className={buttonClass("surface", "pill-sm")}
              onClick={() => {
                setOpen(true);
              }}
            >
              <TimerIcon aria-hidden />
              Start a timer
            </button>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {timers.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-[14px] bg-card-nested px-3 py-2 ring-1 ring-border dark:ring-glass-border">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
                  {isRunning(t) ? <TimerIcon aria-hidden className="size-3.5 shrink-0 text-signal" /> : <Pause aria-hidden className="size-3.5 shrink-0 text-ink-3" />}
                  <span className="truncate">{t.label}</span>
                </span>
                <span className="shrink-0 tabular text-[12px] text-ink-2">{status(t, now)}</span>
              </li>
            ))}
          </ul>
        )}

      </div>
    </WidgetCard>
  );
}
