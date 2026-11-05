import { RollingNumber } from "@/components/ui/rolling-number";
import { formatMoney, type FormatOptions, type Money } from "@/lib/money/currency";
import type { Category } from "@/lib/money/money";
import type { CategoryColor } from "@/lib/money/categories";
import { cn } from "@/lib/utils";

/**
 * Every money figure on screen goes through here (SPEC V25): one exact
 * formatter, tabular digits, and a `data-money` hook so privacy mode (T38)
 * can blur them all at once. `roll` animates changes: the changed digits
 * roll up when the amount rises and down when it falls.
 */
export function MoneyText({ value, className, roll = false, ...options }: { value: Money; className?: string; roll?: boolean } & FormatOptions) {
  const text = formatMoney(value, options);
  return (
    <span data-money className={cn("tabular", className)}>
      {roll ? <RollingNumber text={text} value={value.minor} /> : text}
    </span>
  );
}

/** Totals in several currencies: the first one large, the rest on a quiet line under it. */
export function MoneyStack({ values, fallback, className, roll = false }: { values: readonly Money[]; fallback: Money; className?: string; roll?: boolean }) {
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
    </span>
  );
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

export function CategoryDot({ color, className }: { color: CategoryColor; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[color], className)} />;
}
