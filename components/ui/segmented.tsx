"use client";

import * as React from "react";
import { motion } from "motion/react";
import { TAB_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A row of pressed/unpressed pills with a sliding indicator (the palette's
 * theme switch, generalised). A group of toggle buttons, not a radio group:
 * each is its own tab stop, so no roving-focus contract is promised.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  layoutId,
  size = "md",
}: {
  label: string;
  /** null: nothing pressed yet (a value only the client knows, before hydration). */
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  /**
   * The indicator's shared id. Pass one from a component that outlives this
   * control when the control remounts in another spot (a view that renders it
   * in a different branch); a fresh useId would break the slide.
   */
  layoutId?: string;
  /** sm: the mini tab for a sub-choice under another control. */
  size?: "md" | "sm";
}) {
  const ownId = React.useId();
  const indicatorId = layoutId ?? ownId;
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex w-fit max-w-full flex-wrap items-center rounded-pill bg-sheet ring-1 ring-border dark:bg-background/40 dark:ring-glass-border",
        size === "sm" ? "p-0.5" : "p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              onChange(o.value);
            }}
            className={cn(
              "relative isolate inline-flex items-center rounded-pill font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              size === "sm" ? "h-6 px-2.5 text-[11px]" : "h-8 px-3.5 text-[12px]",
              active ? "text-inverse-foreground dark:text-signal" : "text-ink-2 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={indicatorId}
                layoutDependency={value}
                transition={TAB_SPRING}
                aria-hidden
                style={{ borderRadius: 9999 }}
                className="absolute inset-0 -z-10 bg-inverse dark:bg-signal-soft"
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
