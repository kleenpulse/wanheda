// Zod-free on purpose: lib/capabilities.ts (and so the proxy) imports this.

export interface WeatherLocation {
  latitude: number;
  longitude: number;
  place: string;
}

/** Reads a location from raw env strings. Null unless all three are present and in range. */
export function parseLocation(raw: {
  latitude: string | undefined;
  longitude: string | undefined;
  place: string | undefined;
}): WeatherLocation | null {
  const place = raw.place?.trim();
  if (!place || !raw.latitude?.trim() || !raw.longitude?.trim()) return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, place };
}
