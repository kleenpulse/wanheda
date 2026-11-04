import { cn } from "@/lib/utils";

/**
 * The rail's mark: a W under the signal dot, the island it watches. Raven's
 * disc treatment: inked in Ember, a lit ring in Nebula. 24-grid, lucide stroke.
 */
export function WanhedaMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-inverse text-inverse-foreground",
        "dark:bg-transparent dark:text-signal dark:shadow-glow dark:ring-1 dark:ring-signal/60",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none">
        <path
          d="M5 9.5 8.2 18 12 11.5 15.8 18 19 9.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="5.5" r="1.5" className="fill-signal" />
      </svg>
    </span>
  );
}
