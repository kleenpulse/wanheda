import type * as React from "react";
import { Suspense } from "react";
import { requireOwner } from "@/lib/auth/owner";
import type { WidgetId } from "@/lib/modules";
import { ClockWidget } from "./clock-widget";
import { IncomeMrrWidget, IncomeNetNewWidget } from "./income-widgets";
import { MoneyBudgetWidget, MoneyRenewalsWidget, MoneyTodayWidget } from "./money-widgets";
import { PinnedNotesWidget } from "./pinned-notes-widget";
import { TodayWidget } from "./today-widget";
import { WeatherSkeleton, WeatherWidget } from "./weather-widget";

/**
 * Every widget's rendered node, built on the server and handed to the client
 * board as slots, so a widget can be a server component that fetches its own
 * data. Keyed by WidgetId: a manifest widget without a renderer fails typecheck.
 * A widget that reads the request does it inside its own Suspense, so Home
 * itself never waits on it.
 */
export function widgetNodes(): Record<WidgetId, React.ReactNode> {
  return {
    "home.clock": <ClockWidget />,
    "home.weather": (
      <Suspense fallback={<WeatherSkeleton />}>
        <Weather />
      </Suspense>
    ),
    "home.today": <TodayWidget />,
    "home.note": <PinnedNotesWidget />,
    "money.today": <MoneyTodayWidget />,
    "money.budget": <MoneyBudgetWidget />,
    "money.renewals": <MoneyRenewalsWidget />,
    "income.mrr": <IncomeMrrWidget />,
    "income.net-new": <IncomeNetNewWidget />,
  };
}

async function Weather() {
  const owner = await requireOwner();
  return <WeatherWidget mode={owner.kind === "owner" ? "owner" : "demo"} />;
}
