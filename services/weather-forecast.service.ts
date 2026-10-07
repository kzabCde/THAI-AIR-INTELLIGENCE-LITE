import "server-only";

import { unstable_cache } from "next/cache";
import { getProvince } from "@/lib/isan";
import type { HourlyWeatherForecast, HourlyWeatherPoint } from "./types";

/**
 * Real hourly weather forecast (temperature, humidity, rain probability, rain
 * amount, wind) from the Open-Meteo forecast API — the same provider the
 * daily-sync job already uses for observed weather.
 *
 * Before this existed the UI *estimated* rain chance from relative humidity
 * (≥85 % ⇒ "80 %"), which showed 80 % rain for every humid night even when the
 * model forecast was ~2–20 %. Rain chance must come from a forecast model.
 *
 * Responses are cached per province for 30 minutes in Next's data cache, so the
 * upstream API is hit at most twice an hour per province. Failures are *not*
 * cached (the cached function throws) and resolve to an empty point list, so
 * the UI degrades to "no rain data" instead of inventing numbers.
 */

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const HOURLY_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation_probability",
  "precipitation",
  "wind_speed_10m",
  "wind_direction_10m",
] as const;
const REVALIDATE_SECONDS = 1800;
const REQUEST_TIMEOUT_MS = 5000;

type OpenMeteoHourly = Partial<Record<(typeof HOURLY_VARIABLES)[number], (number | null)[]>> & {
  time?: string[];
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchOpenMeteoHourly(lat: number, lon: number): Promise<HourlyWeatherPoint[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: HOURLY_VARIABLES.join(","),
    // Today 00:00 → D+7 23:00 local, covering the 24h strip and all 7 forecast days.
    forecast_days: "8",
    timezone: "Asia/Bangkok",
  });
  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Open-Meteo forecast HTTP ${response.status}`);
  const json = (await response.json()) as { hourly?: OpenMeteoHourly; utc_offset_seconds?: number };
  const hourly = json.hourly;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    throw new Error("Open-Meteo forecast response has no hourly block");
  }
  const offsetMs = (json.utc_offset_seconds ?? 7 * 3600) * 1000;

  return hourly.time.map((localTime, index) => ({
    // `localTime` is wall-clock time in Asia/Bangkok without an offset.
    t: new Date(Date.parse(`${localTime}:00Z`) - offsetMs).toISOString(),
    temperature: finiteOrNull(hourly.temperature_2m?.[index]),
    humidity: finiteOrNull(hourly.relative_humidity_2m?.[index]),
    precipitationProbability: finiteOrNull(hourly.precipitation_probability?.[index]),
    precipitation: finiteOrNull(hourly.precipitation?.[index]),
    windSpeed: finiteOrNull(hourly.wind_speed_10m?.[index]),
    windDirection: finiteOrNull(hourly.wind_direction_10m?.[index]),
  }));
}

const cachedProvinceForecast = unstable_cache(
  async (provinceId: string): Promise<HourlyWeatherForecast> => {
    const province = getProvince(provinceId);
    if (!province) throw new Error(`Unknown province ${provinceId}`);
    const points = await fetchOpenMeteoHourly(province.lat, province.lon);
    return { provinceId: province.id, source: "open-meteo", fetchedAt: new Date().toISOString(), points };
  },
  ["isan", "hourly-weather-forecast-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: ["isan-weather-forecast"] },
);

export async function getHourlyWeatherForecast(provinceId: string): Promise<HourlyWeatherForecast> {
  try {
    return await cachedProvinceForecast(provinceId);
  } catch (error) {
    console.warn(`[weather-forecast] unavailable for ${provinceId}:`, error instanceof Error ? error.message : error);
    return { provinceId, source: "open-meteo", fetchedAt: null, points: [] };
  }
}
