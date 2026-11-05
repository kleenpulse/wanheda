"use client";

import { RouteTabs } from "@/components/shell/route-tabs";
import { usePeriodParam } from "./use-period";

// Entries, analytics, budgets, subscriptions and rules are pages of one app.
// The links carry the period (`?p=`), so a hop keeps it.

const TABS = [
  { href: "/money", label: "Entries" },
  { href: "/money/analytics", label: "Analytics" },
  { href: "/money/budgets", label: "Budgets" },
  { href: "/money/subscriptions", label: "Subscriptions" },
  { href: "/money/rules", label: "Rules" },
] as const;

export function MoneyTabs() {
  const p = usePeriodParam();
  return <RouteTabs label="Money pages" tabs={TABS} layoutId="money-tabs" query={p ? `p=${encodeURIComponent(p)}` : null} />;
}
