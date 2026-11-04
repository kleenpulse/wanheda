import { cn } from "@/lib/utils";

// Raven button recipe (vxrcel-ui-design components.md), as class strings until
// Phase 1 vendors the full primitive into components/ui.
const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap outline-none transition-all select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const VARIANT = {
  inverse: "bg-inverse text-inverse-foreground hover:bg-inverse/88",
  surface:
    "border border-border bg-sheet text-foreground hover:bg-card dark:border-glass-border dark:bg-card-nested dark:hover:bg-accent",
  ghost: "text-ink-2 hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
} as const;

const SIZE = {
  pill: "h-10 rounded-pill px-5 text-sm active:scale-[0.98] [&_svg:not([class*='size-'])]:size-4",
  "pill-sm": "h-8 rounded-pill px-3.5 text-[0.8125rem] active:scale-[0.98] [&_svg:not([class*='size-'])]:size-4",
  "circle-sm": "size-9 rounded-full active:scale-95 [&_svg:not([class*='size-'])]:size-[18px]",
} as const;

export function buttonClass(
  variant: keyof typeof VARIANT,
  size: keyof typeof SIZE,
  className?: string,
): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}
