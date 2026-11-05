"use client";

import type * as React from "react";
import { axisMoney, ChartCard, ChartTable, ChartTip, niceStep, TipRow } from "@/components/money/charts/chart-kit";
import { FigureText, MoneyText } from "@/components/money/money-text";
import { useMask } from "@/components/money/privacy";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import type { MonthRow } from "@/lib/saas/income";
import { cn } from "@/lib/utils";
import { barSegment, KIND_META, KIND_ORDER, KIND_ORDER_DOWN, KIND_ORDER_UP, KindLegend, monthName, monthTick, PLOT_FRAME, useSlots } from "./kit";

// MRR movements by month, stacked by kind (FR-INCOME, ChartMogul's movements
// chart): gains stack up from zero (new, expansion, reactivation), losses
// down (contraction, churn), with a 2px surface gap between segments and the
// net as a short ink tick. A month is picked by click or Enter; the waterfall
// beside it explains that month.

const PAD_L = 52;
const PAD_R = 4;
const PAD_T = 10;
const PLOT_H = 170;
const AXIS_H = 24;
const GAP = 2;

export function MovementBars({
  rows,
  currency,
  selected,
  onSelect,
  note,
}: {
  rows: readonly MonthRow[];
  currency: Currency;
  selected: string;
  onSelect: (month: string) => void;
  note?: React.ReactNode;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  const n = rows.length;
  const selectedIndex = Math.max(0, rows.findIndex((r) => r.month === selected));
  const pick = (i: number) => {
    const r = rows[i];
    if (r) onSelect(r.month);
  };
  const { active, move, handlers } = useSlots(n, selectedIndex, pick);

  const up = rows.map((r) => KIND_ORDER_UP.reduce((s, k) => s + Math.max(0, r.byKind[k]), 0));
  const down = rows.map((r) => KIND_ORDER_DOWN.reduce((s, k) => s + Math.max(0, -r.byKind[k]), 0));
  const maxUp = Math.max(0, ...up);
  const maxDown = Math.max(0, ...down);
  const step = niceStep(Math.max(maxUp, maxDown, 1), maxDown > 0 ? 2 : 3);
  const top = Math.max(step, Math.ceil(maxUp / step) * step);
  const bottom = Math.ceil(maxDown / step) * step;
  const ticks: number[] = [];
  for (let t = -bottom; t <= top; t += step) ticks.push(t);
  const span = top + bottom;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const slot = n > 0 ? plotW / n : 0;
  const barW = Math.max(3, Math.min(28, slot * 0.6));
  const y = (v: number) => PAD_T + ((top - v) / span) * PLOT_H;
  const zero = y(0);
  const base = PAD_T + PLOT_H;
  const every = Math.max(1, Math.ceil((n * 44) / Math.max(1, plotW)));

  const money = (minor: number, sign = true) => <MoneyText value={{ minor, currency }} sign={sign ? "always" : "auto"} />;
  const label = (r: MonthRow) => `${monthName(r.month)}${r.partial ? ", so far" : ""}`;

  const table = (
    <ChartTable
      caption="MRR movements by month"
      head={["Month", ...KIND_ORDER.map((k) => KIND_META[k].label), "Net"]}
      rows={[...rows].reverse().map((r) => ({ key: r.month, cells: [label(r), ...KIND_ORDER.map((k) => money(r.byKind[k])), money(r.net)] }))}
    />
  );
  const legend = (
    <KindLegend
      extra={
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded-full bg-foreground" />
          Net
        </span>
      }
    />
  );
  const shown = active ?? null;
  const row = shown !== null ? rows[shown] : undefined;

  return (
    <ChartCard title="MRR movements" note={note} legend={legend} table={table}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="MRR movements by month. Arrow keys move between months, Enter shows a month in the waterfall; the table view lists every value."
        {...handlers}
        onPointerMove={(e) => {
          if (slot <= 0) return;
          move(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - PAD_L) / slot));
        }}
        onClick={() => {
          if (active !== null) pick(active);
        }}
        className={cn(PLOT_FRAME, "cursor-pointer")}
        style={{ height: PAD_T + PLOT_H + AXIS_H }}
      >
        {width > 0 ? (
          <svg width={width} height={PAD_T + PLOT_H + AXIS_H} aria-hidden className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={width - PAD_R}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? "stroke-ink-3" : "stroke-border"}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text data-money data-masked={mask.hidden || undefined} x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular font-figure fill-ink-3 text-[10.5px]">
                  <FigureText svg text={mask.show(axisMoney(t, currency))} />
                </text>
              </g>
            ))}
            <rect x={PAD_L + slot * selectedIndex} y={PAD_T} width={slot} height={PLOT_H} rx={6} className="fill-signal/[0.08]" />
            {shown !== null && shown !== selectedIndex ? <rect x={PAD_L + slot * shown} y={PAD_T} width={slot} height={PLOT_H} rx={6} className="fill-foreground/[0.05]" /> : null}
            {rows.map((r, i) => {
              const x = PAD_L + slot * i + (slot - barW) / 2;
              const ups = KIND_ORDER_UP.filter((k) => r.byKind[k] > 0);
              const downs = KIND_ORDER_DOWN.filter((k) => r.byKind[k] < 0);
              let acc = 0;
              const upPaths = ups.map((k, j) => {
                const from = y(acc) - (j > 0 ? GAP / 2 : 0);
                acc += r.byKind[k];
                const to = y(acc) + (j < ups.length - 1 ? GAP / 2 : 0);
                return <path key={k} d={barSegment(x, barW, from, Math.min(from, to), j === ups.length - 1 ? "top" : "none")} className={KIND_META[k].fill} />;
              });
              acc = 0;
              const downPaths = downs.map((k, j) => {
                const from = y(acc) + (j > 0 ? GAP / 2 : 0);
                acc += r.byKind[k];
                const to = y(acc) - (j < downs.length - 1 ? GAP / 2 : 0);
                return <path key={k} d={barSegment(x, barW, from, Math.max(from, to), j === downs.length - 1 ? "bottom" : "none")} className={KIND_META[k].fill} />;
              });
              return (
                <g key={r.month} opacity={r.partial ? 0.85 : 1}>
                  {upPaths}
                  {downPaths}
                  {r.net !== 0 ? <line x1={x - 3} x2={x + barW + 3} y1={y(r.net)} y2={y(r.net)} strokeWidth={2} strokeLinecap="round" className="stroke-foreground" /> : null}
                </g>
              );
            })}
            {rows.map((r, i) =>
              i % every === 0 || i === n - 1 ? (
                <text key={r.month} x={PAD_L + slot * i + slot / 2} y={base + 16} textAnchor="middle" className="tabular fill-ink-3 text-[10.5px]">
                  {monthTick(r.month)}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}
        {row && shown !== null ? (
          <ChartTip x={PAD_L + slot * shown + slot / 2} y={Math.min(y(up[shown] ?? 0), zero) - 2} width={width}>
            <span className="flex flex-col gap-1">
              <span className="text-ink-2">{label(row)}</span>
              {KIND_ORDER.filter((k) => row.byKind[k] !== 0).map((k) => (
                <TipRow key={k} swatch={KIND_META[k].bg} value={money(row.byKind[k])} label={KIND_META[k].label} />
              ))}
              <TipRow swatch="bg-foreground" value={money(row.net)} label="Net" />
            </span>
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {row ? (
            <>
              {label(row)}: net {money(row.net)}
              {KIND_ORDER.filter((k) => row.byKind[k] !== 0).map((k) => (
                <span key={k}>
                  , {KIND_META[k].label} {money(row.byKind[k])}
                </span>
              ))}
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
