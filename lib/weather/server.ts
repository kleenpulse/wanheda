import "server-only";
import { cacheLife } from "next/cache";
import { weatherLocation } from "@/lib/capabilities";
import { SAMPLE_WEATHER, forecastUrl, parseForecast, type Weather, type WeatherLocation } from "./open-meteo";

export type WeatherResult =
  | { kind: "live"; weather: Weather }
  | { kind: "sample"; weather: Weather }
  | { kind: "error" };

// Throws on failure, so a failed fetch is not cached for the whole window.
async function fetchForecast(location: WeatherLocation): Promise<Weather> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  const res = await fetch(forecastUrl(location), { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Open-Meteo answered ${String(res.status)}`);
  const weather = parseForecast(await res.json(), location.place);
  if (!weather) throw new Error("Open-Meteo sent an unexpected shape");
  return weather;
}

/**
 * The board's weather. Demo mode always shows the sample, even when a location
 * is set: the location is the owner's, and demo is open to anyone (SPEC V6).
 * A configured fetch that fails is an error, not a quiet sample (SPEC V17).
 */
export async function getWeather(mode: "demo" | "owner"): Promise<WeatherResult> {
  const location = mode === "owner" ? weatherLocation() : null;
  if (!location) return { kind: "sample", weather: SAMPLE_WEATHER };
  try {
    return { kind: "live", weather: await fetchForecast(location) };
  } catch (error) {
    console.error("weather fetch failed", error);
    return { kind: "error" };
  }
}
