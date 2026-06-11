import "server-only";

import type { Tables } from "@/lib/supabase/database.types";
import { dateDaysAgo, getSupabase, isSupabaseConfigured } from "./_db";

export type DailyRow = Tables<"daily_summary">;

export type DailyPoint = {
  date: string;
  pm25: number | null;
  pm25Max: number | null;
  pm25Min: number | null;
  aqi: number | null;
  temp: number | null;
  tempMax: number | null;
  tempMin: number | null;
  humidity: number | null;
  wind: number | null;
  windMax: number | null;
  windDir: number | null;
  hotspots: number | null;
  hoursAvailable: number | null;
  isBurningSeason: boolean | null;
};

function toPoint(r: Partial<DailyRow> & { date: string }): DailyPoint {
  return {
    date: r.date,
    pm25: r.pm25_mean ?? null,
    pm25Max: r.pm25_max ?? null,
    pm25Min: r.pm25_min ?? null,
    aqi: r.aqi_mean ?? null,
    temp: r.temp_mean ?? null,
    tempMax: r.temp_max ?? null,
    tempMin: r.temp_min ?? null,
    humidity: r.humidity_mean ?? null,
    wind: r.wind_speed_mean ?? null,
    windMax: r.wind_speed_max ?? null,
    windDir: r.wind_dir_mean ?? null,
    hotspots: r.hotspot_count ?? null,
    hoursAvailable: r.hours_available ?? null,
    isBurningSeason: r.is_burning_season ?? null,
  };
}

/** Daily history for a province over the past `days` (7 / 30 / 90 …). */
export async function getDailyHistory(provinceId: string, days: number): Promise<DailyPoint[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from("daily_summary")
    .select("date, pm25_mean, pm25_max, pm25_min, aqi_mean, temp_mean, temp_max, temp_min, humidity_mean, wind_speed_mean, wind_speed_max, wind_dir_mean, hotspot_count, hours_available, is_burning_season")
    .eq("province_id", provinceId)
    .gte("date", dateDaysAgo(days))
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toPoint);
}

/** Previous-day mean PM2.5 per province (used for the current-day delta). */
export async function getYesterdayMeanByProvince(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isSupabaseConfigured) return result;
  const { data, error } = await getSupabase()
    .from("daily_summary")
    .select("province_id, date, pm25_mean")
    .gte("date", dateDaysAgo(3))
    .order("date", { ascending: false });
  if (error) throw error;
  // Take the second-most-recent day per province as "yesterday".
  const seen = new Map<string, number>();
  for (const r of data ?? []) {
    const n = seen.get(r.province_id) ?? 0;
    if (n === 1 && r.pm25_mean != null) result.set(r.province_id, r.pm25_mean);
    seen.set(r.province_id, n + 1);
  }
  return result;
}

export type MonthlyPoint = { month: string; pm25: number; aqi: number; samples: number };

/** Monthly average PM2.5/AQI for a province across the full history. */
export async function getMonthlyAverages(provinceId: string, months = 12): Promise<MonthlyPoint[]> {
  if (!isSupabaseConfigured) return [];
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - months);
  const { data, error } = await getSupabase()
    .from("daily_summary")
    .select("date, pm25_mean, aqi_mean")
    .eq("province_id", provinceId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });
  if (error) throw error;
  const buckets = new Map<string, { pm: number; aqi: number; n: number }>();
  for (const r of data ?? []) {
    const key = r.date.slice(0, 7);
    const b = buckets.get(key) ?? { pm: 0, aqi: 0, n: 0 };
    b.pm += r.pm25_mean ?? 0;
    b.aqi += r.aqi_mean ?? 0;
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()].map(([month, b]) => ({
    month,
    pm25: b.n ? +(b.pm / b.n).toFixed(1) : 0,
    aqi: b.n ? Math.round(b.aqi / b.n) : 0,
    samples: b.n,
  }));
}

export type SeasonPoint = { season: string; seasonTh: string; pm25: number; samples: number };

/**
 * Seasonal comparison. Isan has a pronounced burning/dry season (Nov–Apr) that
 * dominates PM2.5, so we bucket by meteorological season.
 */
export async function getSeasonalAverages(provinceId: string): Promise<SeasonPoint[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from("daily_summary")
    .select("month, pm25_mean")
    .eq("province_id", provinceId);
  if (error) throw error;
  const defs: { key: string; th: string; months: number[] }[] = [
    { key: "Burning (Dry)", th: "ฤดูเผา (แล้ง)", months: [11, 12, 1, 2, 3, 4] },
    { key: "Hot", th: "ฤดูร้อน", months: [3, 4, 5] },
    { key: "Rainy", th: "ฤดูฝน", months: [6, 7, 8, 9, 10] },
  ];
  return defs.map((d) => {
    const rows = (data ?? []).filter((r) => r.month != null && d.months.includes(r.month));
    const sum = rows.reduce((a, r) => a + (r.pm25_mean ?? 0), 0);
    return {
      season: d.key,
      seasonTh: d.th,
      pm25: rows.length ? +(sum / rows.length).toFixed(1) : 0,
      samples: rows.length,
    };
  });
}
