"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type AirQualityRow = Tables<"air_quality_hourly">;

const LOOKBACK_MS = 6 * 3600_000;

/** Latest PM2.5/AQI reading for every province (deduplicated). */
export async function getLatestAirQuality(): Promise<AirQualityRow[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data, error } = await sb
    .from("air_quality_hourly")
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

/** Latest PM2.5/AQI reading for a single province. */
export async function getProvinceAirQuality(province: string): Promise<AirQualityRow | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("air_quality_hourly")
    .select("*")
    .eq("province_id", province)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Latest reading scoped to a specific station within a province.
 * `district` maps to `station_id` in the hourly table.
 */
export async function getDistrictAirQuality(
  province: string,
  district: string,
): Promise<AirQualityRow | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("air_quality_hourly")
    .select("*")
    .eq("province_id", province)
    .eq("station_id", district)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Hourly PM2.5 history for a province over the past `hours`. */
export async function getAirQualityHistory(
  province: string,
  hours = 72,
): Promise<AirQualityRow[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await sb
    .from("air_quality_hourly")
    .select("*")
    .eq("province_id", province)
    .gte("observed_at", since)
    .order("observed_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
