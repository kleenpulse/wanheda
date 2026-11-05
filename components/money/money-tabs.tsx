"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { TAB_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { usePeriodParam } from "./use-period";

// Entries, analytics, budgets, subscriptions and rules are pages of one app. The links carry the period
// (`?p=`), so a hop keeps it, and live in the money layout, so the pill
// slides between them like the house Segmented.

const TABS = [
  { href: "/money", label: "Entries" },
  { href: "/money/analytics", label: "Analytics" },
  { href: "/money/budgets", label: "Budgets" },
  { href: "/money/subscriptions", label: "Subscriptions" },
  { href: "/money/rules", label: "Rules" },
] as const;

export function MoneyTabs() {
  const pathname = usePathname();
  const p = usePeriodParam();
  return (
    <nav
      aria-label="Money pages"
      className="flex w-fit max-w-full items-center overflow-x-auto rounded-pill bg-sheet p-1 ring-1 ring-border dark:bg-background/40 dark:ring-glass-border"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        const href = (p ? `${t.href}?p=${encodeURIComponent(p)}` : t.href) as Route;
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
                layoutId="money-tabs"
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
