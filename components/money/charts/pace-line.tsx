"use client";

import * as React from "react";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import { shortDayLabel, type Day } from "@/lib/money/dates";
import { FigureText, MoneyText } from "../money-text";
import { useMask } from "../privacy";
import { axisMoney, ChartCard, ChartTable, ChartTip, ticksFor, TipRow } from "./chart-kit";

// Cumulative spend, this period against the one before (FR-MONEY-6), and the
// month's budget as a dashed level when there is one (T38). Emphasis form:
// this period in the signal with a 10% wash, the previous one in the
// de-emphasis grey. A legend; one crosshair snaps to the day and the tooltip
// lists both.

const PAD_L = 52;
const PAD_R = 10;
const PAD_T = 12;
const PLOT_H = 150;
const AXIS_H = 24;

export function PaceLine({
  current,
  previous,
  currentDays,
  previousDays,
  currency,
  dim,
  note,
  budget,
}: {
  /** Running totals from the first day up to today (or the period's end). */
  current: readonly number[];
  /** Running totals over the whole previous period. */
  previous: readonly number[];
  currentDays: readonly Day[];
  previousDays: readonly Day[];
  currency: Currency;
  dim?: boolean;
  note?: React.ReactNode;
  /** The period's budget in `currency`, drawn as a dashed level. */
  budget?: number | undefined;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  const [active, setActive] = React.useState<number | null>(null);
  const len = Math.max(currentDays.length, previousDays.length, 2);
  const ticks = ticksFor(Math.max(0, ...current, ...previous, budget ?? 0));
  const yMax = ticks.at(-1) ?? 1;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const base = PAD_T + PLOT_H;
  const x = (i: number) => PAD_L + (i / (len - 1)) * plotW;
  const y = (v: number) => base - (Math.max(0, v) / yMax) * PLOT_H;
  const line = (vs: readonly number[]) => vs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const lastCur = current.length - 1;
  const area = current.length > 1 ? `${line(current)}L${x(lastCur).toFixed(1)},${base}L${x(0)},${base}Z` : "";
  const labelEvery = Math.max(1, Math.ceil((len * 44) / Math.max(1, plotW)));

  const move = (i: number) => {
    setActive(Math.max(0, Math.min(len - 1, i)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = active ?? Math.max(0, lastCur);
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? len - 1 : null;
    if (next === null) return;
    e.preventDefault();
    move(next);
  };

  const cur = active !== null ? current[active] : undefined;
  const prev = active !== null ? previous[active] : undefined;
  const curDay = active !== null ? currentDays[active] : undefined;
  const prevDay = active !== null ? previousDays[active] : undefined;

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-signal" />
        This period
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-ink-3" />
        Previous period
      </span>
      {budget !== undefined ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-ink-2" />
          Budget <MoneyText value={{ minor: budget, currency }} />
        </span>
      ) : null}
    </div>
  );

  const table = (
    <ChartTable
      caption="Spend so far, by day of the period"
      head={["Day", "This period", "Previous"]}
      rows={Array.from({ length: len }, (_, i) => ({
        key: String(i),
        cells: [
          `Day ${String(i + 1)}`,
          current[i] !== undefined ? <MoneyText key="c" value={{ minor: current[i], currency }} /> : "–",
          previous[i] !== undefined ? <MoneyText key="p" value={{ minor: previous[i], currency }} /> : "–",
        ],
      }))}
    />
  );

  const tipY = Math.min(cur !== undefined ? y(cur) : base, prev !== undefined ? y(prev) : base);

  return (
    <ChartCard title="Spend so far" note={note} legend={legend} table={table} dim={dim ?? false}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Spend so far against the previous period. Arrow keys move by day; the table view lists every value."
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (active === null) move(Math.max(0, lastCur));
        }}
        onBlur={() => {
          setActive(null);
        }}
        onPointerMove={(e) => {
          if (plotW <= 0) return;
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD_L;
          move(Math.round((px / plotW) * (len - 1)));
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
                  <FigureText svg text={mask.show(axisMoney(t, currency))} />
                </text>
              </g>
            ))}
            {Array.from({ length: len }, (_, i) =>
              i % labelEvery === 0 ? (
                <text key={i} x={x(i)} y={base + 16} textAnchor="middle" className="tabular fill-ink-3 text-[10.5px]">
                  {String(i + 1)}
                </text>
              ) : null,
            )}
            {budget !== undefined && budget > 0 ? (
              <line x1={PAD_L} x2={width - PAD_R} y1={y(budget)} y2={y(budget)} strokeDasharray="5 4" strokeWidth={1.5} className="stroke-ink-2" />
            ) : null}
            {previous.length > 1 ? <path d={line(previous)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-ink-3" /> : null}
            {area ? <path d={area} className="fill-signal/10" /> : null}
            {current.length > 1 ? <path d={line(current)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-signal" /> : null}
            {active !== null ? <line x1={x(active)} x2={x(active)} y1={PAD_T} y2={base} className="stroke-ink-3" strokeWidth={1} /> : null}
            {active !== null && prev !== undefined ? <circle cx={x(active)} cy={y(prev)} r={4} strokeWidth={2} className="fill-ink-3 stroke-card" /> : null}
            {lastCur >= 0 ? (
              <circle cx={x(active !== null && cur !== undefined ? active : lastCur)} cy={y((active !== null ? cur : undefined) ?? current[lastCur] ?? 0)} r={4} strokeWidth={2} className="fill-signal stroke-card" />
            ) : null}
          </svg>
        ) : null}
        {active !== null ? (
          <ChartTip x={x(active)} y={tipY} width={width}>
            <span className="flex flex-col gap-1">
              {cur !== undefined && curDay ? <TipRow swatch="bg-signal" value={<MoneyText value={{ minor: cur, currency }} />} label={shortDayLabel(curDay)} /> : null}
              {prev !== undefined && prevDay ? <TipRow swatch="bg-ink-3" value={<MoneyText value={{ minor: prev, currency }} />} label={shortDayLabel(prevDay)} /> : null}
            </span>
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {active !== null ? (
            <>
              Day {active + 1}
              {cur !== undefined ? (
                <>
                  , this period <MoneyText value={{ minor: cur, currency }} />
                </>
              ) : null}
              {prev !== undefined ? (
                <>
                  , previous <MoneyText value={{ minor: prev, currency }} />
                </>
              ) : null}
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
