"use client";

import { Pause, Play, Plus, X } from "lucide-react";
import { orderTimers } from "@/components/island/timer-activity";
import { buttonClass } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useNow } from "@/hooks/use-now";
import { useActivity } from "@/lib/activity/store";
import { MINUTE, formatClock, isDone, isRunning, progress, remainingMs, type Timer } from "@/lib/activity/timer";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

const PRESETS = [5, 15, 25, 50] as const;
const TICK_MS = 250;

/**
 * The timer mini window: every timer on the bus with its controls, and quick
 * starts. It reads the same store as the island, so the two never disagree.
 */
export function TimerWindow() {
  const now = useNow(TICK_MS);
  const timers = useActivity((s) => s.timers);
  const start = useActivity((s) => s.startTimer);
  const ordered = orderTimers(timers);

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-5">
      {now === null ? null : ordered.length === 0 ? (
        <p className="text-[13px] text-ink-2">No timers running. Start one below, or type a length in the palette.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((t) => (
            <TimerRow key={t.id} timer={t} now={now} />
          ))}
        </ul>
      )}

      <div className="mt-auto">
        <p className="readout">Start</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {PRESETS.map((min) => (
            <button
              key={min}
              type="button"
              className={buttonClass("surface", "pill-sm", "tabular px-2")}
              onClick={() => {
                start(min * MINUTE);
              }}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimerRow({ timer: t, now }: { timer: Timer; now: number }) {
  const toggle = useActivity((s) => s.toggleTimer);
  const add = useActivity((s) => s.addToTimer);
  const cancel = useActivity((s) => s.cancelTimer);
  const done = isDone(t, now);
  const running = isRunning(t);

  return (
    <li className="flex items-center gap-3 rounded-[16px] bg-card-nested p-3 ring-1 ring-border dark:ring-glass-border">
      <ProgressRing value={progress(t, now)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-ink-2">{t.label}</p>
        <p
          className={cn(
            "tabular font-display text-kpi-sm",
            done ? "animate-pulse text-signal-ink dark:text-signal" : running ? "text-foreground" : "text-ink-3",
          )}
        >
          {done ? "Done" : formatClock(remainingMs(t, now))}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {done ? null : (
          <Tip
            type="button"
            aria-label={`${running ? "Pause" : "Resume"} ${t.label}`}
            label={running ? "Pause" : "Resume"}
            onClick={() => {
              toggle(t.id);
            }}
            className={buttonClass("surface", "circle-sm", "size-8")}
          >
            {running ? <Pause aria-hidden className="size-4 fill-current" /> : <Play aria-hidden className="size-4 translate-x-px fill-current" />}
          </Tip>
        )}
        <Tip
          type="button"
          aria-label={`Add 5 minutes to ${t.label}`}
          label="Add 5 minutes"
          onClick={() => {
            add(t.id);
          }}
          className={buttonClass("surface", "circle-sm", "size-8")}
        >
          <Plus aria-hidden className="size-4" />
        </Tip>
        <Tip
          type="button"
          aria-label={`${done ? "Dismiss" : "Cancel"} ${t.label}`}
          label={done ? "Dismiss" : "Cancel"}
          onClick={() => {
            cancel(t.id);
          }}
          className={buttonClass("ghost", "circle-sm", "size-8")}
        >
          <X aria-hidden className="size-4" />
        </Tip>
      </div>
    </li>
  );
}
