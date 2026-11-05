"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { TAB_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * An app's pages as a pill row in its header (Money, Income). Lives in the
 * app's layout, so it stays mounted across the pages and the pill slides
 * like the house Segmented. `query` is carried onto every link (money's period).
 */
export function RouteTabs({
  label,
  tabs,
  layoutId,
  query,
}: {
  label: string;
  tabs: readonly { href: string; label: string }[];
  layoutId: string;
  query?: string | null;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="flex w-fit max-w-full items-center overflow-x-auto rounded-pill bg-sheet p-1 ring-1 ring-border dark:bg-background/40 dark:ring-glass-border"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        const href = (query ? `${t.href}?${query}` : t.href) as Route;
        return (
          <Link
            key={t.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative isolate inline-flex h-8 items-center rounded-pill px-3.5 text-[12px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-inverse-foreground dark:text-signal" : "text-ink-2 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                layoutDependency={pathname}
                transition={TAB_SPRING}
                aria-hidden
                style={{ borderRadius: 9999 }}
                className="absolute inset-0 -z-10 bg-inverse dark:bg-signal-soft"
              />
            )}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
