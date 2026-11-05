"use client";

import type * as React from "react";
import { axisMoney, ChartCard, ChartTable, ChartTip, niceStep, TipRow } from "@/components/money/charts/chart-kit";
import { FigureText, MoneyText } from "@/components/money/money-text";
import { useMask } from "@/components/money/privacy";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import type { NetMonth } from "@/lib/money/net";
import { barSegment, monthName, monthTick, PLOT_FRAME, useSlots } from "./kit";

// Ledger income up, spending down, per month, with the net as an ink tick
// (T43). Two series, so a legend; blue and magenta are a validated adjacent
// pair (kit.tsx). Every figure is in the base currency (V26).

const PAD_L = 52;
const PAD_R = 4;
const PAD_T = 10;
const PLOT_H = 170;
const AXIS_H = 24;

export function NetBars({
  rows,
  currency,
  dim,
  note,
  extraHead,
  extraCell,
}: {
  rows: readonly NetMonth[];
  currency: Currency;
  dim?: boolean;
  note?: React.ReactNode;
  /** One more table column, e.g. SaaS revenue shown beside and never added. */
  extraHead?: string;
  extraCell?: (row: NetMonth) => React.ReactNode;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  const n = rows.length;
  const { active, move, handlers } = useSlots(n, n - 1);
  const up = rows.map((r) => Math.max(0, r.income.total.minor));
  const down = rows.map((r) => Math.max(0, r.spend.total.minor));
  const maxUp = Math.max(0, ...up);
  const maxDown = Math.max(0, ...down);
  const step = niceStep(Math.max(maxUp, maxDown, 1), 2);
  const top = Math.max(step, Math.ceil(maxUp / step) * step);
  const bottom = Math.max(maxDown > 0 ? step : 0, Math.ceil(maxDown / step) * step);
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
  const money = (minor: number, sign = false) => <MoneyText value={{ minor, currency }} sign={sign ? "always" : "auto"} />;
  const label = (r: NetMonth) => `${monthName(r.month)}${r.partial ? ", so far" : ""}`;

  const table = (
    <ChartTable
      caption="Income, spending and net by month"
      head={["Month", "Income", "Spending", "Net", ...(extraHead ? [extraHead] : [])]}
      rows={[...rows].reverse().map((r) => ({
        key: r.month,
        cells: [label(r), money(r.income.total.minor), money(r.spend.total.minor), money(r.net.total.minor, true), ...(extraCell ? [extraCell(r)] : [])],
      }))}
    />
  );
  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] bg-cat-blue" />
        Income
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] bg-cat-magenta" />
        Spending
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-foreground" />
        Net
      </span>
    </div>
  );
  const row = active !== null ? rows[active] : undefined;

  return (
    <ChartCard title="Income and spending" note={note} legend={legend} table={table} dim={dim ?? false}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Income and spending by month. Arrow keys move between months; the table view lists every value."
        {...handlers}
        onPointerMove={(e) => {
          if (slot <= 0) return;
          move(Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - PAD_L) / slot));
        }}
        className={PLOT_FRAME}
        style={{ height: PAD_T + PLOT_H + AXIS_H }}
      >
        {width > 0 ? (
          <svg width={width} height={PAD_T + PLOT_H + AXIS_H} aria-hidden className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-ink-3" : "stroke-border"} strokeWidth={1} shapeRendering="crispEdges" />
                <text data-money data-masked={mask.hidden || undefined} x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular font-figure fill-ink-3 text-[10.5px]">
                  <FigureText svg text={mask.show(axisMoney(t, currency))} />
                </text>
              </g>
            ))}
            {active !== null ? <rect x={PAD_L + slot * active} y={PAD_T} width={slot} height={PLOT_H} rx={6} className="fill-foreground/[0.05]" /> : null}
            {rows.map((r, i) => {
              const x = PAD_L + slot * i + (slot - barW) / 2;
              const inc = up[i] ?? 0;
              const out = down[i] ?? 0;
              const net = r.net.total.minor;
              return (
                <g key={r.month} opacity={r.partial ? 0.85 : 1}>
                  {inc > 0 ? <path d={barSegment(x, barW, y(inc), zero - 1, "top")} className="fill-cat-blue" /> : null}
                  {out > 0 ? <path d={barSegment(x, barW, zero + 1, y(-out), "bottom")} className="fill-cat-magenta" /> : null}
                  {net !== 0 ? <line x1={x - 3} x2={x + barW + 3} y1={y(net)} y2={y(net)} strokeWidth={2} strokeLinecap="round" className="stroke-foreground" /> : null}
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
        {row && active !== null ? (
          <ChartTip x={PAD_L + slot * active + slot / 2} y={Math.min(y(up[active] ?? 0), zero) - 2} width={width}>
            <span className="flex flex-col gap-1">
              <span className="text-ink-2">{label(row)}</span>
              <TipRow swatch="bg-cat-blue" value={money(row.income.total.minor)} label="Income" />
              <TipRow swatch="bg-cat-magenta" value={money(row.spend.total.minor)} label="Spending" />
              <TipRow swatch="bg-foreground" value={money(row.net.total.minor, true)} label="Net" />
            </span>
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {row ? (
            <>
              {label(row)}: income {money(row.income.total.minor)}, spending {money(row.spend.total.minor)}, net {money(row.net.total.minor, true)}
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
