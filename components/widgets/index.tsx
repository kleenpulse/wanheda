import type * as React from "react";
import { Suspense } from "react";
import type { WidgetId } from "@/lib/modules";
import { ClockWidget } from "./clock-widget";
import { NoteWidget } from "./note-widget";
import { TodayWidget } from "./today-widget";
import { WeatherSkeleton, WeatherWidget } from "./weather-widget";

/**
 * Every widget's rendered node, built on the server and handed to the client
 * board as slots, so a widget can be a server component that fetches its own
 * data. Keyed by WidgetId: a manifest widget without a renderer fails typecheck.
 */
export function widgetNodes(mode: "demo" | "owner"): Record<WidgetId, React.ReactNode> {
  return {
    "home.clock": <ClockWidget />,
    "home.weather": (
      <Suspense fallback={<WeatherSkeleton />}>
        <WeatherWidget mode={mode} />
      </Suspense>
    ),
    "home.today": <TodayWidget />,
    "home.note": <NoteWidget />,
  };
}
