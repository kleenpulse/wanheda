"use client";

import type * as React from "react";
import { RollingNumber } from "@/components/ui/rolling-number";
import { formatMoney, type FormatOptions, type Money } from "@/lib/money/currency";
import type { Converted } from "@/lib/money/fx";
import type { Category } from "@/lib/money/money";
import type { CategoryColor } from "@/lib/money/categories";
import { cn } from "@/lib/utils";
import { useMask } from "./privacy";

/**
 * Every money figure on screen goes through here (SPEC V25): one exact
 * formatter, tabular digits, and a `data-money` hook. Privacy mode (T38)
 * shows dots instead (`data-masked`). `roll` animates changes: the changed
 * digits roll up when the amount rises and down when it falls.
 */
export function MoneyText({ value, className, roll = false, ...options }: { value: Money; className?: string; roll?: boolean } & FormatOptions) {
  const mask = useMask();
  const text = formatMoney(value, options);
  return (
    <span data-money data-masked={mask.hidden || undefined} className={cn("tabular", className)}>
      {mask.hidden ? mask.show(text) : roll ? <RollingNumber text={text} value={value.minor} /> : text}
    </span>
  );
}

/** Totals in several currencies: the first one large, the rest on a quiet line under it, then an optional note. */
export function MoneyStack({
  values,
  fallback,
  className,
  roll = false,
  note,
}: {
  values: readonly Money[];
  fallback: Money;
  className?: string;
  roll?: boolean;
  note?: React.ReactNode;
}) {
  const [first = fallback, ...rest] = values;
  return (
    <span className={cn("flex min-w-0 flex-col", className)}>
      <MoneyText value={first} roll={roll} className="truncate" />
      {rest.length > 0 ? (
        <span className="truncate text-[12px] font-normal tracking-normal text-ink-2">
          {rest.map((m, i) => (
            <span key={m.currency}>
              {i > 0 ? " · " : "and "}
              <MoneyText value={m} roll={roll} />
            </span>
          ))}
        </span>
      ) : null}
      {note ? <span className="truncate pt-1 text-[12px] font-normal tracking-normal text-ink-3">{note}</span> : null}
    </span>
  );
}

/**
 * A converted total (V26): the figure in the base currency, then anything
 * that had no rate, apart; under it, what it was converted from.
 */
export function ConvertedStack({ value, className, roll = false }: { value: Converted; className?: string; roll?: boolean }) {
  const base = value.total.currency;
  const foreign = value.originals.filter((m) => m.currency !== base && !value.missing.some((x) => x.currency === m.currency));
  const note =
    foreign.length > 0 ? (
      <>
        {"From "}
        {value.originals
          .filter((m) => !value.missing.some((x) => x.currency === m.currency))
          .map((m, i) => (
            <span key={m.currency}>
              {i > 0 ? " + " : ""}
              <MoneyText value={m} />
            </span>
          ))}
      </>
    ) : value.missing.length > 0 ? (
      "No rate yet for the rest"
    ) : null;
  return <MoneyStack values={[value.total, ...value.missing]} fallback={value.total} className={className ?? ""} roll={roll} note={note} />;
}

// Static class names, so Tailwind sees every one (data palette, never the signal: V29).
const DOT: Record<CategoryColor, string> = {
  blue: "bg-cat-blue",
  aqua: "bg-cat-aqua",
  yellow: "bg-cat-yellow",
  magenta: "bg-cat-magenta",
  green: "bg-cat-green",
  violet: "bg-cat-violet",
  red: "bg-cat-red",
  cyan: "bg-cat-cyan",
  slate: "bg-cat-slate",
};

/** A category's mark: its emoji on a soft disc, with a dot of its colour. Never colour alone. */
export function CategoryMark({ category, className }: { category: Category | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full bg-card-nested text-[17px] ring-1 ring-border dark:ring-glass-border",
        className,
      )}
    >
      {category?.emoji || "·"}
      <span className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-sheet", DOT[category?.color ?? "slate"])} />
    </span>
  );
}

/** A category colour's fill class, for marks such as bars and dots. */
export function categoryBg(color: CategoryColor): string {
  return DOT[color];
}

export function CategoryDot({ color, className }: { color: CategoryColor; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[color], className)} />;
}
