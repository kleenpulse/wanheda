"use client";

import type * as React from "react";
import { Pause, Play, Plus, Timer as TimerIcon, X } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { useActivity } from "@/lib/activity/store";
import { formatClock, isDone, isRunning, progress, remainingMs, type Timer } from "@/lib/activity/timer";
import { cn } from "@/lib/utils";

// The timer's three island views. Each reads the timer from the bus and the
// clock from the island, so the pill and the card can never disagree.

function Ring({ value, children }: { value: number; children?: React.ReactNode }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-[22px] shrink-0 place-items-center text-signal">
      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={12} cy={12} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
        <circle
          cx={12}
          cy={12}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          className="transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      {children}
    </span>
  );
}

function RoundButton({
  label,
  onClick,
  tone = "plain",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "plain" | "signal";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-150 active:scale-90",
        "outline-none focus-visible:ring-2 focus-visible:ring-island-foreground/70 [&_svg]:size-5",
        tone === "signal"
          ? "bg-signal/20 text-signal hover:bg-signal/30"
          : "bg-island-foreground/12 text-island-foreground hover:bg-island-foreground/20",
      )}
    >
      {children}
    </button>
  );
}

function useTimer(id: string): Timer | undefined {
  return useActivity((s) => s.timers.find((t) => t.id === id));
}

function TimerLeading({ id }: { id: string }) {
  const { now } = useIsland();
  const t = useTimer(id);
  if (!t) return null;
  return (
    <Ring value={progress(t, now)}>
      <TimerIcon className={cn("size-3", isDone(t, now) && "animate-pulse")} />
    </Ring>
  );
}

function TimerTrailing({ id }: { id: string }) {
  const { now } = useIsland();
  const t = useTimer(id);
  if (!t) return null;
  return (
    <span className={cn("tabular text-sm font-semibold", isRunning(t) ? "text-signal" : "text-island-foreground/60")}>
      {isDone(t, now) ? "Done" : formatClock(remainingMs(t, now))}
    </span>
  );
}

function TimerCard({ id }: { id: string }) {
  const { now, collapse } = useIsland();
  const t = useTimer(id);
  const toggle = useActivity((s) => s.toggleTimer);
  const add = useActivity((s) => s.addToTimer);
  const cancel = useActivity((s) => s.cancelTimer);
  if (!t) return null;
  const done = isDone(t, now);
  const running = isRunning(t);

  return (
    <div className="flex items-center justify-between gap-4 p-5">
      <div className="flex gap-2.5">
        {done ? null : (
          <RoundButton
            label={running ? "Pause timer" : "Resume timer"}
            tone="signal"
            onClick={() => {
              toggle(id);
            }}
          >
            {running ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
          </RoundButton>
        )}
        <RoundButton
          label="Add 5 minutes"
          tone={done ? "signal" : "plain"}
          onClick={() => {
            add(id);
          }}
        >
          <Plus />
        </RoundButton>
        <RoundButton
          label={done ? "Dismiss timer" : "Cancel timer"}
          onClick={() => {
            collapse();
            cancel(id);
          }}
        >
          <X />
        </RoundButton>
      </div>
      <div className="min-w-0 text-right">
        <p className="truncate text-xs font-medium text-island-foreground/70">{t.label}</p>
        <p
          className={cn(
            "tabular text-[2.75rem] leading-none font-light",
            running ? "text-signal" : "text-island-foreground/60",
          )}
        >
          {done ? "Done" : formatClock(remainingMs(t, now))}
        </p>
      </div>
    </div>
  );
}

/** What the screen reader hears on the compact pill, after the name. */
function TimerStatus({ id }: { id: string }) {
  const { now } = useIsland();
  const t = useTimer(id);
  if (!t) return null;
  if (isDone(t, now)) return ", done";
  return `, ${isRunning(t) ? "running" : "paused"}, ${formatClock(remainingMs(t, now))} left`;
}

export function timerActivity(t: Timer): IslandActivity {
  return {
    id: t.id,
    label: t.label,
    status: <TimerStatus id={t.id} />,
    leading: <TimerLeading id={t.id} />,
    trailing: <TimerTrailing id={t.id} />,
    expanded: <TimerCard id={t.id} />,
  };
}

/**
 * Running timers by soonest end (a finished one ended earliest, so it leads and
 * asks for attention), then paused ones by least time left. Needs no clock.
 */
export function orderTimers(timers: readonly Timer[]): Timer[] {
  const group = (t: Timer) => (t.endsAt === null ? 1 : 0);
  const value = (t: Timer) => t.endsAt ?? t.pausedLeftMs ?? 0;
  return [...timers].sort((a, b) => group(a) - group(b) || value(a) - value(b));
}
