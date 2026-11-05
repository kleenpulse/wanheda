"use client";

import * as React from "react";
import type { Currency } from "@/lib/money/currency";
import { addDays, longDayLabel, shortDayLabel, startOfWeek, type Day } from "@/lib/money/dates";
import { daysOf } from "@/lib/money/periods";
import { heatLevel, heatThresholds } from "@/lib/money/reports";
import { cn } from "@/lib/utils";
import { MoneyText } from "../money-text";
import { ChartCard, ChartTable, ChartTip, TipRow } from "./chart-kit";

// Daily spend on a calendar (FR-MONEY-6). Sequential: one hue (the signal's)
// at four validated lightness steps (--heat-*), cut at the owner's own
// quartiles; a day with nothing spent is the bare surface. Up to six weeks
// reads as a month calendar (weeks down, Mon–Sun across); longer periods as a
// strip of week columns. One tab stop: arrows move a day, up and down a week.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const LEVEL = ["bg-card-nested ring-1 ring-inset ring-border dark:ring-glass-border", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"] as const;

export function SpendHeatmap({
  from,
  to,
  today,
  daily,
  currency,
  dim,
  note,
}: {
  from: Day;
  to: Day;
  today: Day;
  /** Spend per day (positive minor units); refunds can make a day negative. */
  daily: ReadonlyMap<Day, number>;
  currency: Currency;
  dim?: boolean;
  note?: React.ReactNode;
}) {
  const last = to < today ? to : today;
  const weeks = React.useMemo(() => {
    const out: Day[] = [];
    for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) out.push(w);
    return out;
  }, [from, to]);
  const calendar = weeks.length <= 6;
  const thresholds = React.useMemo(() => heatThresholds(daily.values()), [daily]);
  const shown = (d: Day) => d >= from && d <= last;

  const box = React.useRef<HTMLDivElement>(null);
  const cells = React.useRef(new Map<Day, HTMLElement>());
  const [active, setActive] = React.useState<Day | null>(null);
  const [tip, setTip] = React.useState<{ x: number; y: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = active ? cells.current.get(active) : undefined;
    const host = box.current;
    if (!el || !host) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    setTip({ x: r.left - h.left + r.width / 2, y: r.top - h.top, width: h.width });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (last < from) return;
    const at = active ?? last;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    // In the strip, weeks run across: left/right is a week, up/down a day.
    const delta = step === undefined ? undefined : calendar ? step : Math.abs(step) === 1 ? step * 7 : step / 7;
    let next: Day | null = null;
    if (delta !== undefined) next = addDays(at, delta);
    else if (e.key === "Home") next = from;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next < from ? from : next > last ? last : next);
  };

  const cellFor = (d: Day, size: string) => {
    if (!shown(d)) return <span key={d} aria-hidden className={size} />;
    const v = daily.get(d) ?? 0;
    return (
      <span
        key={d}
        ref={(el) => {
          if (el) cells.current.set(d, el);
          else cells.current.delete(d);
        }}
        aria-hidden
        onPointerEnter={() => {
          setActive(d);
        }}
        className={cn(size, "rounded-[4px] transition-[outline-color]", LEVEL[heatLevel(v, thresholds)], active === d && "outline-2 outline-offset-1 outline-foreground")}
      />
    );
  };

  const activeValue = active ? (daily.get(active) ?? 0) : 0;
  const table = (
    <ChartTable
      caption="Spend per day"
      head={["Day", "Spent"]}
      rows={daysOf(from, last).map((d) => ({ key: d, cells: [shortDayLabel(d), <MoneyText key="v" value={{ minor: daily.get(d) ?? 0, currency }} />] }))}
    />
  );
  const legend = (
    <div className="flex items-center gap-1.5 text-[11.5px] text-ink-2" aria-hidden>
      Less
      {LEVEL.map((c) => (
        <span key={c} className={cn("size-3 rounded-[3px]", c)} />
      ))}
      More
    </div>
  );

  return (
    <ChartCard title="Daily spend" note={note} legend={legend} table={table} dim={dim ?? false}>
      <div
        ref={box}
        tabIndex={0}
        role="group"
        aria-label="Spend per day on a calendar. Arrow keys move between days; the table view lists every value."
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (!active && last >= from) setActive(last);
        }}
        onBlur={() => {
          setActive(null);
        }}
        onPointerLeave={() => {
          setActive(null);
        }}
        className="relative rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {calendar ? (
          <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1.5">
            <span />
            {WEEKDAYS.map((w) => (
              <span key={w} className="readout text-center">
                {w.slice(0, 1)}
              </span>
            ))}
            {weeks.map((w) => (
              <React.Fragment key={w}>
                <span className="tabular pr-1.5 text-right text-[10.5px] whitespace-nowrap text-ink-3">{shortDayLabel(w < from ? from : w).replace(/^\S+ /, "")}</span>
                {daysOf(w, addDays(w, 6)).map((d) => cellFor(d, "aspect-square w-full max-w-11 justify-self-center"))}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-0">
              {WEEKDAYS.map((w, i) => (
                <span key={w} className="h-3.5 text-[10px] leading-[14px] text-ink-3">
                  {i % 2 === 0 ? w.slice(0, 1) : ""}
                </span>
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">{weeks.flatMap((w) => daysOf(w, addDays(w, 6)).map((d) => cellFor(d, "size-3.5")))}</div>
          </div>
        )}
        {active && tip ? (
          <ChartTip x={tip.x} y={tip.y} width={tip.width}>
            <TipRow value={<MoneyText value={{ minor: activeValue, currency }} />} label={shortDayLabel(active)} />
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {active ? (
            <>
              {longDayLabel(active)}: <MoneyText value={{ minor: activeValue, currency }} />
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
