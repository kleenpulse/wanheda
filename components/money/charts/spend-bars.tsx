"use client";

import * as React from "react";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import { shortDayLabel, type Day } from "@/lib/money/dates";
import { rangeLabel, type Bucket, type BucketSize } from "@/lib/money/periods";
import { MoneyText } from "../money-text";
import { useMask } from "../privacy";
import { axisMoney, ChartCard, ChartTable, ChartTip, ticksFor, TipRow } from "./chart-kit";

// Spend over time (FR-MONEY-6): one series, so one hue (the signal) and no
// legend box; the card's title names it. Thin bars (<= 24px) with a 4px
// rounded top, square on the baseline; hairline solid gridlines; the slot
// under the pointer or the keyboard gets a ghost band and the tooltip.

const PAD_L = 52;
const PAD_R = 4;
const PAD_T = 10;
const PLOT_H = 150;
const AXIS_H = 24;

function tipLabel(b: Bucket, size: BucketSize, today: Day): string {
  if (size === "day") return shortDayLabel(b.from);
  if (size === "week") return rangeLabel(b.from, b.to, today);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${b.from}T00:00:00Z`));
}

function axisLabel(b: Bucket, size: BucketSize, n: number): string {
  const d = new Date(`${b.from}T00:00:00Z`);
  if (size === "day") return n <= 7 ? new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d) : String(d.getUTCDate());
  if (size === "week") return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(d);
}

/** A bar with a rounded top and a square foot. */
function barPath(x: number, w: number, top: number, base: number): string {
  const r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

export function SpendBars({
  buckets,
  values,
  size,
  currency,
  today,
  dim,
  note,
}: {
  buckets: readonly Bucket[];
  values: readonly number[];
  size: BucketSize;
  currency: Currency;
  today: Day;
  dim?: boolean;
  note?: React.ReactNode;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  const [active, setActive] = React.useState<number | null>(null);
  const n = buckets.length;
  const lastShown = buckets.findLastIndex((b) => b.from <= today);
  const ticks = ticksFor(Math.max(0, ...values));
  const yMax = ticks.at(-1) ?? 1;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const slot = n > 0 ? plotW / n : 0;
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const base = PAD_T + PLOT_H;
  const y = (v: number) => base - (Math.max(0, v) / yMax) * PLOT_H;
  const every = size === "day" ? (n <= 7 ? 1 : n <= 14 ? 2 : 7) : Math.max(1, Math.ceil((n * 56) / Math.max(1, plotW)));

  const move = (i: number) => {
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = active ?? Math.max(0, lastShown);
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    move(next);
  };

  const activeBucket = active !== null ? buckets[active] : undefined;
  const activeValue = active !== null ? (values[active] ?? 0) : 0;
  const table = (
    <ChartTable
      caption="Spend per period"
      head={["Period", "Spent"]}
      rows={buckets.map((b, i) => ({ key: b.from, cells: [tipLabel(b, size, today), <MoneyText key="v" value={{ minor: values[i] ?? 0, currency }} />] }))}
    />
  );

  return (
    <ChartCard title="Spend over time" note={note} table={table} dim={dim ?? false}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Spend over time. Arrow keys move between bars; the table view lists every value."
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (active === null) move(Math.max(0, lastShown));
        }}
        onBlur={() => {
          setActive(null);
        }}
        onPointerMove={(e) => {
          if (slot <= 0) return;
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD_L;
          move(Math.floor(x / slot));
        }}
        onPointerLeave={() => {
          setActive(null);
        }}
        className="relative rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: PAD_T + PLOT_H + AXIS_H }}
      >
        {width > 0 ? (
          <svg width={width} height={PAD_T + PLOT_H + AXIS_H} aria-hidden className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} shapeRendering="crispEdges" />
                <text data-money data-masked={mask.hidden || undefined} x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular font-figure fill-ink-3 text-[10.5px]">
                  {mask.show(axisMoney(t, currency))}
                </text>
              </g>
            ))}
            {activeBucket && active !== null ? (
              <rect x={PAD_L + slot * active} y={PAD_T} width={slot} height={PLOT_H} rx={6} className="fill-foreground/[0.05]" />
            ) : null}
            {buckets.map((b, i) => {
              const v = values[i] ?? 0;
              if (b.from > today || v <= 0) return null;
              const x = PAD_L + slot * i + (slot - barW) / 2;
              return <path key={b.from} d={barPath(x, barW, y(v), base)} className="fill-signal" />;
            })}
            {buckets.map((b, i) =>
              i % every === 0 ? (
                <text key={b.from} x={PAD_L + slot * i + slot / 2} y={base + 16} textAnchor="middle" className="tabular fill-ink-3 text-[10.5px]">
                  {axisLabel(b, size, n)}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}
        {activeBucket && active !== null ? (
          <ChartTip x={PAD_L + slot * active + slot / 2} y={Math.min(y(activeValue), base - 4)} width={width}>
            <TipRow value={<MoneyText value={{ minor: activeValue, currency }} />} label={tipLabel(activeBucket, size, today)} />
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {activeBucket ? (
            <>
              {tipLabel(activeBucket, size, today)}: <MoneyText value={{ minor: activeValue, currency }} />
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
