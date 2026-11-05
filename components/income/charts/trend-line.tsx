"use client";

import type * as React from "react";
import { axisMoney, ChartCard, ChartTable, ChartTip, ticksFor, TipRow } from "@/components/money/charts/chart-kit";
import { FigureText, MoneyText } from "@/components/money/money-text";
import { useMask } from "@/components/money/privacy";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import { monthName, monthTick, PLOT_FRAME, useSlots } from "./kit";

// One measure at each month's end (MRR, paying customers): one series, so one
// hue (the signal) with a 10% wash and no legend box; the title names it. The
// month still running is a hollow point, said "so far" in the tooltip.

const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 12;
const PLOT_H = 150;
const AXIS_H = 24;

const COUNT = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

export function TrendLine({
  title,
  note,
  months,
  values,
  partialLast,
  currency,
  unit,
}: {
  title: string;
  note?: React.ReactNode;
  months: readonly string[];
  values: readonly number[];
  partialLast: boolean;
  /** Money in this currency; omitted for a count. */
  currency?: Currency;
  /** What a count is of: "customers". */
  unit?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  const n = months.length;
  const { active, move, handlers } = useSlots(n, n - 1);
  const ticks = ticksFor(Math.max(0, ...values));
  const yMax = ticks.at(-1) ?? 1;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const base = PAD_T + PLOT_H;
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => base - (Math.max(0, v) / yMax) * PLOT_H;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = n > 1 ? `${line}L${x(n - 1).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z` : "";
  const every = Math.max(1, Math.ceil((n * 44) / Math.max(1, plotW)));

  const figure = (v: number) => (currency ? <MoneyText value={{ minor: v, currency }} /> : <span className="tabular">{v.toLocaleString("en-GB")}</span>);
  const axis = (v: number) => (currency ? mask.show(axisMoney(v, currency)) : COUNT.format(v));
  const label = (i: number) => `${monthName(months[i] ?? "")}${partialLast && i === n - 1 ? ", so far" : ""}`;

  const table = (
    <ChartTable
      caption={title}
      head={["Month", currency ? "MRR" : (unit ?? "Value")]}
      rows={months.map((m, i) => ({ key: m, cells: [label(i), figure(values[i] ?? 0)] })).reverse()}
    />
  );
  const v = active !== null ? (values[active] ?? 0) : 0;

  return (
    <ChartCard title={title} note={note} table={table}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`${title} by month. Arrow keys move between months; the table view lists every value.`}
        {...handlers}
        onPointerMove={(e) => {
          if (plotW <= 0 || n === 0) return;
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD_L;
          move(n <= 1 ? 0 : Math.round((px / plotW) * (n - 1)));
        }}
        className={PLOT_FRAME}
        style={{ height: PAD_T + PLOT_H + AXIS_H }}
      >
        {width > 0 ? (
          <svg width={width} height={PAD_T + PLOT_H + AXIS_H} aria-hidden className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} shapeRendering="crispEdges" />
                <text
                  data-money={currency ? true : undefined}
                  data-masked={(currency && mask.hidden) || undefined}
                  x={PAD_L - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="tabular font-figure fill-ink-3 text-[10.5px]"
                >
                  <FigureText svg text={axis(t)} />
                </text>
              </g>
            ))}
            {months.map((m, i) =>
              i % every === 0 || i === n - 1 ? (
                <text key={m} x={x(i)} y={base + 16} textAnchor="middle" className="tabular fill-ink-3 text-[10.5px]">
                  {monthTick(m)}
                </text>
              ) : null,
            )}
            {area ? <path d={area} className="fill-signal/10" /> : null}
            {n > 1 ? <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-signal" /> : null}
            {active !== null ? <line x1={x(active)} x2={x(active)} y1={PAD_T} y2={base} className="stroke-ink-3" strokeWidth={1} /> : null}
            {n > 0 ? (
              <circle
                cx={x(active ?? n - 1)}
                cy={y(values[active ?? n - 1] ?? 0)}
                r={4}
                strokeWidth={2}
                className={partialLast && (active ?? n - 1) === n - 1 ? "fill-card stroke-signal" : "fill-signal stroke-card"}
              />
            ) : null}
          </svg>
        ) : null}
        {active !== null ? (
          <ChartTip x={x(active)} y={y(v)} width={width}>
            <TipRow value={figure(v)} label={label(active)} />
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {active !== null ? (
            <>
              {label(active)}: {figure(v)}
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
