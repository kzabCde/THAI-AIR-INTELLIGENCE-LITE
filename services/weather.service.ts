import "server-only";

import type { Tables } from "@/lib/supabase/database.types";
import { cachedMapQuery, getLatestObservedAt, getServiceSupabase, isSupabaseConfigured } from "./_db";
import type { TimePoint } from "./types";

export type WeatherRow = Tables<"weather_hourly">;

export async function getLatestWeather(provinceId: string): Promise<WeatherRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getServiceSupabase()
    .from("weather_latest")
    .select("*")
    .eq("province_id", provinceId)
    .maybeSingle();
  if (error) throw error;
  return data as WeatherRow | null;
}

export const getLatestWeatherByProvince = cachedMapQuery(
  ["latest-weather-all"],
  async (): Promise<Map<string, WeatherRow>> => {
    const result = new Map<string, WeatherRow>();
    if (!isSupabaseConfigured) return result;
    const { data, error } = await getServiceSupabase()
      .from("weather_latest")
      .select("*");
    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.province_id, row as WeatherRow);
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
  const { data, error } = await getServiceSupabase()
    .from("weather_hourly")
    .select("observed_at, temperature, humidity, wind_speed, wind_direction, pressure")
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
    windDirection: r.wind_direction,
    pressure: r.pressure,
  }));
}
