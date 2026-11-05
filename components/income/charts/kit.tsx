"use client";

import * as React from "react";
import { monthStart } from "@/lib/saas/income";
import type { MovementKind } from "@/lib/saas/mrr";
import { cn } from "@/lib/utils";

// Shared pieces of the income charts (dataviz skill). Movement kinds wear the
// data palette in one fixed mapping, checked with the skill's validator on
// both skins in stack order (reactivation, expansion, new | contraction,
// churn): worst adjacent CVD ΔE 9.1 light, 8.4 dark. Light-mode contrast is
// under 3:1 for three of them, so every chart has a legend and a table twin.

export const KIND_ORDER_UP = ["new", "expansion", "reactivation"] as const satisfies readonly MovementKind[];
export const KIND_ORDER_DOWN = ["contraction", "churn"] as const satisfies readonly MovementKind[];
/** Legend and table order. */
export const KIND_ORDER: readonly MovementKind[] = [...KIND_ORDER_UP, ...KIND_ORDER_DOWN];

// Static class names, so Tailwind sees every one.
export const KIND_META: Record<MovementKind, { label: string; fill: string; bg: string }> = {
  new: { label: "New", fill: "fill-cat-blue", bg: "bg-cat-blue" },
  expansion: { label: "Expansion", fill: "fill-cat-aqua", bg: "bg-cat-aqua" },
  reactivation: { label: "Reactivation", fill: "fill-cat-yellow", bg: "bg-cat-yellow" },
  contraction: { label: "Contraction", fill: "fill-cat-magenta", bg: "bg-cat-magenta" },
  churn: { label: "Churn", fill: "fill-cat-violet", bg: "bg-cat-violet" },
};

const SHORT = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_YEAR = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** "Nov", or "Jan 26" in January so a year turn reads. */
export function monthTick(month: string): string {
  const d = monthStart(month);
  return d.getUTCMonth() === 0 ? SHORT_YEAR.format(d) : SHORT.format(d);
}

/** "November 2026". */
export function monthName(month: string): string {
  return LONG.format(monthStart(month));
}

export function KindLegend({ kinds = KIND_ORDER, extra }: { kinds?: readonly MovementKind[]; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-[3px]", KIND_META[k].bg)} />
          {KIND_META[k].label}
        </span>
      ))}
      {extra}
    </div>
  );
}

/**
 * The slot under the pointer or the keyboard, for charts whose marks sit in
 * equal slots (months, steps). Arrow keys, Home and End move; Enter picks.
 */
export function useSlots(count: number, fallback: number, onPick?: (i: number) => void) {
  const [active, setActive] = React.useState<number | null>(null);
  const move = React.useCallback(
    (i: number) => {
      setActive(Math.max(0, Math.min(count - 1, i)));
    },
    [count],
  );
  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = active ?? fallback;
    if ((e.key === "Enter" || e.key === " ") && onPick && active !== null) {
      e.preventDefault();
      onPick(active);
      return;
    }
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? count - 1 : null;
    if (next === null) return;
    e.preventDefault();
    move(next);
  };
  const handlers = {
    onKeyDown,
    onFocus: () => {
      if (active === null) move(fallback);
    },
    onBlur: () => {
      setActive(null);
    },
    onPointerLeave: () => {
      setActive(null);
    },
  };
  return { active: active !== null && active < count ? active : null, move, handlers };
}

/** A bar from `a` to `b` (either order) with 4px rounding on the end away from the baseline only. */
export function barSegment(x: number, w: number, a: number, b: number, round: "top" | "bottom" | "none"): string {
  const top = Math.min(a, b);
  const bottom = Math.max(a, b);
  const r = round === "none" ? 0 : Math.min(4, w / 2, bottom - top);
  if (round === "top") return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
  if (round === "bottom") return `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${top}Z`;
  return `M${x},${top}H${x + w}V${bottom}H${x}Z`;
}

/** The frame every income chart's plot sits in: focusable, with a ring on keyboard focus. */
export const PLOT_FRAME = "relative rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
