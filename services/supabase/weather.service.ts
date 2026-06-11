"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type WeatherRow = Tables<"weather_hourly">;

const LOOKBACK_MS = 6 * 3600_000;

/** Latest weather reading for every province (deduplicated). */
export async function getLatestWeather(): Promise<WeatherRow[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data, error } = await sb
    .from("weather_hourly")
    .select("*")
    .gte("observed_at", since)
    .order("observed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return (data ?? []).filter((r) => {
    if (seen.has(r.province_id)) return false;
    seen.add(r.province_id);
    return true;
  });
}

/** Latest weather reading for a single province. */
export async function getProvinceWeather(province: string): Promise<WeatherRow | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("weather_hourly")
    .select("*")
    .eq("province_id", province)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Hourly weather history for a province over the past `hours`. */
export async function getWeatherHistory(province: string, hours = 48): Promise<WeatherRow[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await sb
    .from("weather_hourly")
    .select("*")
    .eq("province_id", province)
    .gte("observed_at", since)
    .order("observed_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
