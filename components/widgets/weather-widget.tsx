import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { Condition, Weather } from "@/lib/weather/open-meteo";
import { getWeather } from "@/lib/weather/server";
import { SampleChip, WidgetCard } from "./widget-card";

function iconFor(condition: Condition, isDay: boolean): LucideIcon {
  switch (condition) {
    case "clear":
      return isDay ? Sun : Moon;
    case "partly":
      return isDay ? CloudSun : CloudMoon;
    case "cloudy":
      return Cloud;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
      return CloudRain;
    case "snow":
      return CloudSnow;
    case "storm":
      return CloudLightning;
  }
}

const degrees = (c: number) => `${String(Math.round(c))}°`;

/** Server component: fetches (cached) and renders. Wrap in Suspense. */
export async function WeatherWidget({ mode }: { mode: "demo" | "owner" }) {
  const result = await getWeather(mode);

  if (result.kind === "error") {
    return (
      <WidgetCard title="Weather" icon={CloudSun}>
        <div className="flex flex-1 items-end gap-2 text-[13px] text-ink-2">
          <span aria-hidden className="mb-1.5 size-1.5 shrink-0 rounded-full bg-critical" />
          Weather is unavailable right now. It retries on the next visit.
        </div>
      </WidgetCard>
    );
  }

  return <WeatherCard weather={result.weather} sample={result.kind === "sample"} />;
}

function WeatherCard({ weather, sample }: { weather: Weather; sample: boolean }) {
  const Icon = iconFor(weather.condition, weather.isDay);
  return (
    <WidgetCard title="Weather" icon={CloudSun} note={sample ? <SampleChip /> : weather.place}>
      <div className="flex flex-1 items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-kpi tabular text-foreground">{degrees(weather.temperature)}</p>
          <p className="mt-1.5 truncate text-[13px] text-ink-2">
            {weather.label}
            {sample ? `, ${weather.place}` : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Icon aria-hidden className="size-8 text-signal" strokeWidth={1.5} />
          <p className="tabular text-[12px] text-ink-2">
            <span className="sr-only">High </span>
            <span aria-hidden>H </span>
            {degrees(weather.high)}
            <span aria-hidden> · L </span>
            <span className="sr-only">, low </span>
            {degrees(weather.low)}
          </p>
        </div>
      </div>
    </WidgetCard>
  );
}

/** Same footprint as the card, for the Suspense fallback. */
export function WeatherSkeleton() {
  return (
    <WidgetCard title="Weather" icon={CloudSun}>
      <div className="flex flex-1 items-end">
        <div className="h-10 w-20 rounded-pill bg-card-nested" />
      </div>
    </WidgetCard>
  );
}
