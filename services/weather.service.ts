import "server-only";

import type { Tables } from "@/lib/supabase/database.types";
import { cachedQuery, getLatestObservedAt, getSupabase, isSupabaseConfigured } from "./_db";
import type { TimePoint } from "./types";

export type WeatherRow = Tables<"weather_hourly">;

export async function getLatestWeather(provinceId: string): Promise<WeatherRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getSupabase()
    .from("weather_hourly")
    .select("*")
    .eq("province_id", provinceId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const getLatestWeatherByProvince = cachedQuery(
  ["latest-weather-all"],
  async (): Promise<Map<string, WeatherRow>> => {
    const result = new Map<string, WeatherRow>();
    if (!isSupabaseConfigured) return result;
    const latest = await getLatestObservedAt();
    if (!latest) return result;
    const since = new Date(new Date(latest).getTime() - 6 * 3600_000).toISOString();
    const { data, error } = await getSupabase()
      .from("weather_hourly")
      .select("*")
      .gte("observed_at", since)
      .order("observed_at", { ascending: false });
    if (error) throw error;
    for (const row of data ?? []) {
      if (!result.has(row.province_id)) result.set(row.province_id, row);
    }
    return result;
  },
  300,
);

export async function getWeatherHistory(provinceId: string, hours: number): Promise<TimePoint[]> {
  if (!isSupabaseConfigured) return [];
  const latest = await getLatestObservedAt();
  if (!latest) return [];
  const since = new Date(new Date(latest).getTime() - hours * 3600_000).toISOString();
  const { data, error } = await getSupabase()
    .from("weather_hourly")
    .select("observed_at, temperature, humidity, wind_speed")
    .eq("province_id", provinceId)
    .gte("observed_at", since)
    .order("observed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    t: r.observed_at,
    pm25: null,
    temperature: r.temperature,
    humidity: r.humidity,
    windSpeed: r.wind_speed,
  }));
}
