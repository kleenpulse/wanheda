import { describe, expect, it } from "vitest";
import { parseLocation } from "./location";
import { describeCode, forecastUrl, parseForecast } from "./open-meteo";

const sample = {
  current: { temperature_2m: 27.4, apparent_temperature: 30.1, weather_code: 61, is_day: 0 },
  daily: { temperature_2m_max: [31.2], temperature_2m_min: [23.9] },
};

describe("parseForecast", () => {
  it("reads the fields we asked for", () => {
    expect(parseForecast(sample, "Lagos")).toEqual({
      place: "Lagos",
      temperature: 27.4,
      feelsLike: 30.1,
      high: 31.2,
      low: 23.9,
      condition: "rain",
      label: "Rain",
      isDay: false,
    });
  });

  it("is null for any other shape", () => {
    expect(parseForecast(null, "x")).toBeNull();
    expect(parseForecast({ current: sample.current }, "x")).toBeNull();
    expect(parseForecast({ ...sample, daily: { temperature_2m_max: [], temperature_2m_min: [] } }, "x")).toBeNull();
    expect(parseForecast({ error: true, reason: "bad latitude" }, "x")).toBeNull();
  });
});

describe("describeCode", () => {
  it("maps WMO codes to conditions", () => {
    expect(describeCode(0).condition).toBe("clear");
    expect(describeCode(2).condition).toBe("partly");
    expect(describeCode(48).condition).toBe("fog");
    expect(describeCode(53).condition).toBe("drizzle");
    expect(describeCode(81).condition).toBe("rain");
    expect(describeCode(75).condition).toBe("snow");
    expect(describeCode(99)).toEqual({ condition: "storm", label: "Thunderstorm, hail" });
    expect(describeCode(42).label).toBe("Unknown");
  });
});

describe("forecastUrl", () => {
  it("asks Open-Meteo for current conditions and today's range, with three decimals of location", () => {
    const url = new URL(forecastUrl({ latitude: 6.524379, longitude: 3.379206, place: "Lagos" }));
    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("6.524");
    expect(url.searchParams.get("longitude")).toBe("3.379");
    expect(url.searchParams.get("forecast_days")).toBe("1");
  });
});

describe("parseLocation", () => {
  it("needs all three values, in range", () => {
    expect(parseLocation({ latitude: "6.5", longitude: "3.4", place: "Lagos" })).toEqual({
      latitude: 6.5,
      longitude: 3.4,
      place: "Lagos",
    });
    expect(parseLocation({ latitude: "6.5", longitude: "3.4", place: " " })).toBeNull();
    expect(parseLocation({ latitude: "", longitude: "3.4", place: "Lagos" })).toBeNull();
    expect(parseLocation({ latitude: "91", longitude: "3.4", place: "Lagos" })).toBeNull();
    expect(parseLocation({ latitude: "6.5", longitude: "east", place: "Lagos" })).toBeNull();
  });
});
