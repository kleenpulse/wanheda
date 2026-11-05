"use client";

import type * as React from "react";
import { axisMoney, ChartCard, ChartTable, ChartTip, ticksFor, TipRow } from "@/components/money/charts/chart-kit";
import { categoryBg, FigureText, MoneyText } from "@/components/money/money-text";
import { useMask } from "@/components/money/privacy";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import type { IncomeProduct } from "@/lib/saas/income";
import { cn } from "@/lib/utils";
import { barSegment, monthName, monthTick, PLOT_FRAME, useSlots } from "./kit";

// Revenue (paid orders less refunds, before tax), never part of MRR (V36).
// Across products: ranked bars, each product in its own colour beside its
// name, so identity is never colour alone. One product: its months, one hue.

export interface ProductRevenue {
  productId: string;
  ordersMinor: number;
  refundsMinor: number;
  netMinor: number;
}

export function RevenueByProduct({
  rows,
  products,
  currency,
  note,
}: {
  rows: readonly ProductRevenue[];
  products: ReadonlyMap<string, IncomeProduct>;
  currency: Currency;
  note?: React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.netMinor));
  const name = (id: string) => products.get(id)?.name ?? "A removed product";
  const money = (minor: number) => <MoneyText value={{ minor, currency }} />;
  const table = (
    <ChartTable
      caption="Revenue by product"
      head={["Product", "Orders", "Refunds", "Revenue"]}
      rows={rows.map((r) => ({ key: r.productId, cells: [name(r.productId), money(r.ordersMinor), money(r.refundsMinor), money(r.netMinor)] }))}
    />
  );
  return (
    <ChartCard title="Revenue by product" note={note} table={table}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-2">No paid orders in these months.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const p = products.get(r.productId);
            return (
              <li key={r.productId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", categoryBg(p?.color ?? "slate"))} />
                  <span className="truncate">{name(r.productId)}</span>
                </span>
                <span className="text-[13px] font-medium text-foreground">{money(r.netMinor)}</span>
                <span aria-hidden className="col-span-2 h-2 overflow-hidden rounded-full bg-card-nested">
                  <span className={cn("block h-full rounded-full", categoryBg(p?.color ?? "slate"))} style={{ width: `${String(Math.max(0, (r.netMinor / max) * 100))}%` }} />
                </span>
                {r.refundsMinor !== 0 ? (
                  <span className="col-span-2 text-[12px] text-ink-2">
                    {money(r.ordersMinor)} in orders, {money(-r.refundsMinor)} refunded
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

const PAD_L = 52;
const PAD_R = 4;
const PAD_T = 10;
const PLOT_H = 150;
const AXIS_H = 24;

/** One product's revenue per month. */
export function RevenueByMonth({ months, values, currency, note }: { months: readonly string[]; values: readonly number[]; currency: Currency; note?: React.ReactNode }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  const n = months.length;
  const { active, move, handlers } = useSlots(n, n - 1);
  const ticks = ticksFor(Math.max(0, ...values));
  const yMax = ticks.at(-1) ?? 1;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const slot = n > 0 ? plotW / n : 0;
  const barW = Math.max(3, Math.min(24, slot * 0.6));
  const base = PAD_T + PLOT_H;
  const y = (v: number) => base - (Math.max(0, v) / yMax) * PLOT_H;
  const every = Math.max(1, Math.ceil((n * 44) / Math.max(1, plotW)));
  const money = (minor: number) => <MoneyText value={{ minor, currency }} />;
  const table = <ChartTable caption="Revenue by month" head={["Month", "Revenue"]} rows={months.map((m, i) => ({ key: m, cells: [monthName(m), money(values[i] ?? 0)] })).reverse()} />;
  const v = active !== null ? (values[active] ?? 0) : 0;
  return (
    <ChartCard title="Revenue by month" note={note} table={table}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Revenue by month. Arrow keys move between months; the table view lists every value."
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
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} shapeRendering="crispEdges" />
                <text data-money data-masked={mask.hidden || undefined} x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular font-figure fill-ink-3 text-[10.5px]">
                  <FigureText svg text={mask.show(axisMoney(t, currency))} />
                </text>
              </g>
            ))}
            {active !== null ? <rect x={PAD_L + slot * active} y={PAD_T} width={slot} height={PLOT_H} rx={6} className="fill-foreground/[0.05]" /> : null}
            {months.map((m, i) => {
              const val = values[i] ?? 0;
              if (val <= 0) return null;
              return <path key={m} d={barSegment(PAD_L + slot * i + (slot - barW) / 2, barW, y(val), base, "top")} className="fill-signal" />;
            })}
            {months.map((m, i) =>
              i % every === 0 || i === n - 1 ? (
                <text key={m} x={PAD_L + slot * i + slot / 2} y={base + 16} textAnchor="middle" className="tabular fill-ink-3 text-[10.5px]">
                  {monthTick(m)}
                </text>
              ) : null,
            )}
          </svg>
        ) : null}
        {active !== null ? (
          <ChartTip x={PAD_L + slot * active + slot / 2} y={Math.min(y(v), base - 4)} width={width}>
            <TipRow value={money(v)} label={monthName(months[active] ?? "")} />
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {active !== null ? (
            <>
              {monthName(months[active] ?? "")}: {money(v)}
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
