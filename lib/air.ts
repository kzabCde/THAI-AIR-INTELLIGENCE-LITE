import fallback from "@/public/data/fallback-air.json";
import { THAI_PROVINCES } from "@/lib/constants";
import type { ForecastPoint, ProvinceAir, ProvinceWeather } from "@/types/air";

const toAqi = (pm25: number) => Math.round(pm25 * 4.2);

export function aqiLabel(pm25: number) {
  if (pm25 <= 12) return "Good";
  if (pm25 <= 35.4) return "Moderate";
  if (pm25 <= 55.4) return "Unhealthy for Sensitive Groups";
  if (pm25 <= 150.4) return "Unhealthy";
  return "Very Unhealthy";
}

export function healthTip(pm25: number) {
  if (pm25 <= 12) return "Great day for outdoor activity.";
  if (pm25 <= 35.4) return "Sensitive people should limit long outdoor exercise.";
  if (pm25 <= 55.4) return "Wear a mask if outdoors for long periods.";
  return "Avoid outdoor exercise and use an air purifier indoors.";
}

export function getForecast(base: number): ForecastPoint[] {
  const day1 = Math.max(5, +(base * 1.03).toFixed(1));
  const day2 = Math.max(5, +((base + day1) / 2).toFixed(1));
  const day3 = Math.max(5, +((base + day1 + day2) / 3).toFixed(1));
  return [
    { day: "Tomorrow", estimate: day1 },
    { day: "Day 2", estimate: day2 },
    { day: "Day 3", estimate: day3 },
  ];
}

export async function fetchThaiAirData(): Promise<ProvinceAir[]> {
  const now = new Date().toISOString();
  try {
    const requests = THAI_PROVINCES.map(async (p) => {
      const url = `https://api.open-meteo.com/v1/air-quality?latitude=${p.lat}&longitude=${p.lon}&hourly=pm2_5&timezone=auto`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Open-Meteo failed for ${p.province}`);
      const json = await res.json();
      const values: number[] = json?.hourly?.pm2_5 ?? [];
      const pm25 = Number(values[values.length - 1] ?? 0);
      return {
        slug: p.slug,
        province: p.province,
        lat: p.lat,
        lon: p.lon,
        pm25: +pm25.toFixed(1),
        fetchedAt: now,
        source: "live" as const,
      };
    });

    const data = await Promise.all(requests);
    if (data.some((d) => Number.isNaN(d.pm25))) throw new Error("Bad PM2.5 data");
    return data;
  } catch {
    return fallback.map((item) => ({ ...item, fetchedAt: now, source: "fallback" as const }));
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<ProvinceWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const i = (json?.hourly?.temperature_2m?.length ?? 1) - 1;
    return {
      temperature: Math.round(json.hourly.temperature_2m[i]),
      humidity: Math.round(json.hourly.relative_humidity_2m[i]),
      wind: Math.round(json.hourly.wind_speed_10m[i]),
    };
  } catch {
    return null;
  }
}

export { toAqi };
