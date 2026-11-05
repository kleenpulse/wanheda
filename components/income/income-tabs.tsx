"use client";

import { RouteTabs } from "@/components/shell/route-tabs";

// Products (the SaaS dashboard), net (ledger income − spending) and goals are pages of one app.
const TABS = [
  { href: "/income", label: "Products" },
  { href: "/income/net", label: "Net" },
  { href: "/income/goals", label: "Goals" },
] as const;

export function IncomeTabs() {
  return <RouteTabs label="Income pages" tabs={TABS} layoutId="income-tabs" />;
}
