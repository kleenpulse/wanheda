"use client";

import { Clock } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { WidgetCard } from "./widget-card";

const MINUTE = 60_000;
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

/** The time and the date, in the browser's locale and zone. Flips on the minute. */
export function ClockWidget() {
  const now = useNow(MINUTE);
  // "Africa/Lagos" → "Lagos": the city is the part anyone reads.
  const zone = now === null ? null : (time.resolvedOptions().timeZone.split("/").pop() ?? "").replace(/_/g, " ");

  return (
    <WidgetCard title="Clock" icon={Clock} note={zone}>
      <div className="flex flex-1 flex-col justify-end">
        {/* Same box before mount, so the card doesn't jump when the time arrives. */}
        <p className="font-display text-kpi tabular text-foreground" aria-live="off">
          {now === null ? <span className="invisible">00:00</span> : <time dateTime={new Date(now).toISOString()}>{time.format(now)}</time>}
        </p>
        <p className="mt-1.5 truncate text-[13px] text-ink-2">{now === null ? " " : date.format(now)}</p>
      </div>
    </WidgetCard>
  );
}
