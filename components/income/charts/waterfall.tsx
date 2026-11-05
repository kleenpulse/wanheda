"use client";

import { axisMoney, ChartCard, ChartTable, ChartTip, ticksFor, TipRow } from "@/components/money/charts/chart-kit";
import { FigureText, MoneyText } from "@/components/money/money-text";
import { useMask } from "@/components/money/privacy";
import { useElementWidth } from "@/hooks/use-element-width";
import type { Currency } from "@/lib/money/currency";
import type { MonthRow } from "@/lib/saas/income";
import type { MovementKind } from "@/lib/saas/mrr";
import { barSegment, KIND_META, KIND_ORDER, monthName, PLOT_FRAME, useSlots } from "./kit";

// One month's MRR bridge: where it started, each kind of movement, where it
// ended. The two levels are neutral ink bars from zero (never a cut axis for
// bars); the steps float from the running level in their kind's colour, so a
// step reads the same here as in the movements chart.

const PAD_L = 52;
const PAD_R = 4;
const PAD_T = 10;
const PLOT_H = 170;
const AXIS_H = 24;

type Step = { key: "start" | "end"; label: string; from: number; to: number } | { key: MovementKind; label: string; from: number; to: number };

/** Axis labels for a narrow chart, where the full words collide. */
const SHORT: Record<Step["key"], string> = { start: "Start", new: "New", expansion: "Exp.", reactivation: "React.", contraction: "Contr.", churn: "Churn", end: "End" };

export function Waterfall({ row, currency }: { row: MonthRow; currency: Currency }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const mask = useMask();
  let level = row.startMrr;
  const steps: Step[] = [{ key: "start", label: "Start", from: 0, to: row.startMrr }];
  for (const k of KIND_ORDER) {
    const d = row.byKind[k];
    steps.push({ key: k, label: KIND_META[k].label, from: level, to: level + d });
    level += d;
  }
  steps.push({ key: "end", label: row.partial ? "Now" : "End", from: 0, to: row.mrr });
  const n = steps.length;
  const { active, move, handlers } = useSlots(n, n - 1);
  const ticks = ticksFor(Math.max(1, ...steps.map((s) => Math.max(s.from, s.to))));
  const yMax = ticks.at(-1) ?? 1;
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const slot = plotW / n;
  const barW = Math.max(6, Math.min(40, slot * 0.62));
  const base = PAD_T + PLOT_H;
  const y = (v: number) => base - (Math.max(0, v) / yMax) * PLOT_H;
  const money = (minor: number, sign = false) => <MoneyText value={{ minor, currency }} sign={sign ? "always" : "auto"} />;
  const valueOf = (s: Step) => (s.key === "start" || s.key === "end" ? money(s.to) : money(s.to - s.from, true));
  const title = `${monthName(row.month)}${row.partial ? " so far" : ""}`;

  const table = <ChartTable caption={`MRR bridge, ${title}`} head={["Step", "MRR"]} rows={steps.map((s) => ({ key: s.key, cells: [s.label, valueOf(s)] }))} />;
  const s = active !== null ? steps[active] : undefined;

  return (
    <ChartCard
      title="MRR bridge"
      note={
        <>
          {title}: {money(row.startMrr)} to {money(row.mrr)}
        </>
      }
      table={table}
    >
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`MRR bridge for ${title}. Arrow keys move between steps; the table view lists every value.`}
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
            {steps.map((st, i) => {
              const x = PAD_L + slot * i + (slot - barW) / 2;
              const level = st.key === "start" || st.key === "end";
              const next = steps[i + 1];
              return (
                <g key={st.key}>
                  {st.from !== st.to ? (
                    <path
                      d={barSegment(x, barW, y(st.from), y(st.to), level ? "top" : "none")}
                      className={st.key === "end" ? "fill-foreground" : st.key === "start" ? "fill-ink-3" : KIND_META[st.key].fill}
                    />
                  ) : null}
                  {next && next.key !== "end" ? (
                    <line x1={x + barW} x2={PAD_L + slot * (i + 1) + (slot - barW) / 2} y1={y(st.to)} y2={y(st.to)} strokeDasharray="2 3" className="stroke-ink-3" strokeWidth={1} />
                  ) : null}
                </g>
              );
            })}
            {steps.map((st, i) => (
              <text key={st.key} x={PAD_L + slot * i + slot / 2} y={base + 16} textAnchor="middle" className="fill-ink-3 text-[10.5px]">
                {width < 460 ? (st.key === "end" ? st.label : SHORT[st.key]) : st.label}
              </text>
            ))}
          </svg>
        ) : null}
        {s && active !== null ? (
          <ChartTip x={PAD_L + slot * active + slot / 2} y={y(Math.max(s.from, s.to))} width={width}>
            <TipRow
              swatch={s.key === "start" ? "bg-ink-3" : s.key === "end" ? "bg-foreground" : KIND_META[s.key].bg}
              value={valueOf(s)}
              label={s.label}
            />
          </ChartTip>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {s ? (
            <>
              {s.label}: {valueOf(s)}
            </>
          ) : null}
        </span>
      </div>
    </ChartCard>
  );
}
