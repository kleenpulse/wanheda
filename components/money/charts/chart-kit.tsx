"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, ChartColumn, Table2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { formatMoney, type Currency } from "@/lib/money/currency";
import { percentChange } from "@/lib/money/reports";
import { cn } from "@/lib/utils";

// Shared pieces of the money charts (dataviz skill): a card whose chart has a
// table twin one press away (tooltips enhance, never gate), one tooltip, nice
// axis ticks, and the change chip. Marks wear role tokens; text wears ink.

/** A chart card: title and note, an optional legend, the chart, and its table twin. */
export function ChartCard({
  title,
  note,
  legend,
  table,
  dim = false,
  className,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  legend?: React.ReactNode;
  table: React.ReactNode;
  /** Data still arriving: hold the frame at reduced opacity, never a skeleton. */
  dim?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = React.useState(false);
  return (
    <section aria-label={title} className={cn("bento flex min-w-0 flex-col gap-3 p-5", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="readout">{title}</h3>
          {note ? <p className="mt-1 truncate text-[12.5px] text-ink-2">{note}</p> : null}
        </div>
        <Tip
          label={asTable ? "Show chart" : "Show table"}
          render={
            <button
              type="button"
              aria-pressed={asTable}
              onClick={() => {
                setAsTable((v) => !v);
              }}
              className={buttonClass("ghost", "circle-sm", "-mt-1.5 -mr-1.5 size-8 text-ink-3")}
            >
              {asTable ? <ChartColumn aria-hidden className="size-4" strokeWidth={1.75} /> : <Table2 aria-hidden className="size-4" strokeWidth={1.75} />}
              <span className="sr-only">{asTable ? `Show ${title} as a chart` : `Show ${title} as a table`}</span>
            </button>
          }
        />
      </header>
      {legend && !asTable ? legend : null}
      <div aria-busy={dim || undefined} className={cn("min-w-0 transition-opacity duration-200", dim && "opacity-50")}>
        {asTable ? table : children}
      </div>
    </section>
  );
}

/** The table twin: label column + value columns, figures right-aligned and tabular. */
export function ChartTable({ caption, head, rows }: { caption: string; head: readonly string[]; rows: readonly { key: string; cells: readonly React.ReactNode[] }[] }) {
  return (
    <div className="max-h-[320px] overflow-auto overscroll-contain rounded-[12px] ring-1 ring-border dark:ring-glass-border">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-card">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("readout px-3 py-2 font-normal", i === 0 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border dark:border-glass-border">
              {r.cells.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-3 py-1.5 text-left font-normal text-ink-2">
                    {c}
                  </th>
                ) : (
                  <td key={i} className="tabular px-3 py-1.5 text-right text-foreground">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One floating readout for the point under the pointer or the keyboard. Values lead, labels follow. */
export function ChartTip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  // Keep the box inside the chart: centred on x, nudged in near the edges.
  const half = 90;
  const left = Math.min(Math.max(x, half), Math.max(half, width - half));
  return (
    <div
      aria-hidden
      className="glass-menu pointer-events-none absolute z-10 w-max max-w-[180px] -translate-x-1/2 -translate-y-full rounded-[12px] px-3 py-2 text-[12px] text-foreground shadow-lift"
      style={{ left, top: y - 10 }}
    >
      {children}
    </div>
  );
}

/** A tooltip row: a short line key in the series' stroke, the value, then the series name. */
export function TipRow({ swatch, value, label }: { swatch?: string; value: React.ReactNode; label: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      {swatch ? <span aria-hidden className={cn("h-0.5 w-3 shrink-0 rounded-full", swatch)} /> : null}
      <span className="font-semibold">{value}</span>
      <span className="text-ink-2">{label}</span>
    </span>
  );
}

/**
 * A clean axis step for a top value: 1, 2 or 5 times a power of ten, in minor
 * units, so about `count` gridlines cover it. Chart geometry only: it never
 * feeds a total shown as a figure.
 */
export function niceStep(max: number, count = 3): number {
  if (max <= 0) return 1;
  let pow = 1;
  for (;;) {
    for (const m of [1, 2, 5]) {
      const step = m * pow;
      if (step * count >= max) return step;
    }
    pow *= 10;
  }
}

/** Ticks from 0 up to the first multiple of the step at or above max. */
export function ticksFor(max: number, count = 3): number[] {
  const step = niceStep(max, count);
  const ticks = [0];
  while ((ticks.at(-1) ?? 0) < max) ticks.push((ticks.at(-1) ?? 0) + step);
  if (ticks.length === 1) ticks.push(step);
  return ticks;
}

/** An axis label: compact money ("₦120K"), exact through Intl like every other figure. */
export function axisMoney(minor: number, currency: Currency): string {
  return formatMoney({ minor, currency }, { compact: true });
}

/**
 * The change against the period compared with: arrow + percent, coloured by
 * whether the move is good (status ink), and said in words for screen readers.
 * With nothing before, it says "New" (or "Same" when both are nothing).
 */
export function Delta({ cur, prev, goodWhenUp, against, className }: { cur: number; prev: number; goodWhenUp: boolean; against: string; className?: string }) {
  const pct = percentChange(cur, prev);
  if (pct === null) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[12px]", className)}>
        <span className="font-medium text-ink-2">{cur === 0 ? "Same" : "New"}</span>
        <span className="truncate text-ink-2">{against}</span>
      </span>
    );
  }
  const up = pct > 0;
  const flat = pct === 0;
  const good = flat ? null : up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px]", className)}>
      <span className={cn("inline-flex items-center gap-0.5 font-medium", good === null ? "text-ink-2" : good ? "text-ok" : "text-warn")}>
        {flat ? null : <Icon aria-hidden className="size-3.5" strokeWidth={2} />}
        <span className="tabular">{flat ? "Same" : `${String(Math.abs(pct))}%`}</span>
        <span className="sr-only">{flat ? "" : up ? " more" : " less"}</span>
      </span>
      <span className="truncate text-ink-2">{against}</span>
    </span>
  );
}
