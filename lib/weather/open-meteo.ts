import { z } from "zod";
import type { WeatherLocation } from "./location";

export type { WeatherLocation };

// Open-Meteo forecast (https://open-meteo.com): free, keyless, CC BY 4.0.
// Pure parsing here; the fetch and its cache live in lib/weather/server.ts.

export type Condition = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface Weather {
  place: string;
  /** Celsius, rounded for display by the widget. */
  temperature: number;
  feelsLike: number;
  high: number;
  low: number;
  condition: Condition;
  label: string;
  isDay: boolean;
}

export function forecastUrl({ latitude, longitude }: WeatherLocation): string {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: "temperature_2m,apparent_temperature,weather_code,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/** WMO weather interpretation codes, as Open-Meteo documents them. */
export function describeCode(code: number): { condition: Condition; label: string } {
  if (code === 0) return { condition: "clear", label: "Clear" };
  if (code === 1) return { condition: "clear", label: "Mainly clear" };
  if (code === 2) return { condition: "partly", label: "Partly cloudy" };
  if (code === 3) return { condition: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { condition: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { condition: "drizzle", label: code >= 56 ? "Freezing drizzle" : "Drizzle" };
  if (code >= 61 && code <= 67) return { condition: "rain", label: code >= 66 ? "Freezing rain" : "Rain" };
  if (code >= 71 && code <= 77) return { condition: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { condition: "rain", label: "Rain showers" };
  if (code === 85 || code === 86) return { condition: "snow", label: "Snow showers" };
  if (code >= 95 && code <= 99) return { condition: "storm", label: code === 95 ? "Thunderstorm" : "Thunderstorm, hail" };
  return { condition: "cloudy", label: "Unknown" };
}

const forecastSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number().int(),
    is_day: z.union([z.literal(0), z.literal(1)]),
  }),
  daily: z.object({
    temperature_2m_max: z.array(z.number()).min(1),
    temperature_2m_min: z.array(z.number()).min(1),
  }),
});

/** Null for any response that is not the shape we asked for. */
export function parseForecast(json: unknown, place: string): Weather | null {
  const parsed = forecastSchema.safeParse(json);
  if (!parsed.success) return null;
  const { current, daily } = parsed.data;
  const high = daily.temperature_2m_max[0];
  const low = daily.temperature_2m_min[0];
  if (high === undefined || low === undefined) return null;
  return {
    place,
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    high,
    low,
    ...describeCode(current.weather_code),
    isDay: current.is_day === 1,
  };
}

/** Shown in demo mode and when no location is configured. Labelled "Sample" in the widget. */
export const SAMPLE_WEATHER: Weather = {
  place: "Lagos",
  temperature: 29,
  feelsLike: 33,
  high: 31,
  low: 24,
  condition: "partly",
  label: "Partly cloudy",
  isDay: true,
};
