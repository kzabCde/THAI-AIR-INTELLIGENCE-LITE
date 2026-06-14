import "server-only";

import type { Tables } from "@/lib/supabase/database.types";
import { cachedMapQuery, getLatestObservedAt, getServiceSupabase, isSupabaseConfigured } from "./_db";
import type { TimePoint } from "./types";

export type AirRow = Tables<"air_quality_hourly">;

/** Most recent PM2.5 reading for a single province (via air_quality_latest view). */
export async function getLatestAir(provinceId: string): Promise<AirRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getServiceSupabase()
    .from("air_quality_latest")
    .select("*")
    .eq("province_id", provinceId)
    .maybeSingle();
  if (error) throw error;
  return data as AirRow | null;
}

/** Latest reading for every province (keyed by province_id) via air_quality_latest view. */
export const getLatestAirByProvince = cachedMapQuery(
  ["latest-air-all"],
  async (): Promise<Map<string, AirRow>> => {
    const result = new Map<string, AirRow>();
    if (!isSupabaseConfigured) return result;
    const { data, error } = await getServiceSupabase()
      .from("air_quality_latest")
      .select("*");
    if (error) throw error;
    for (const row of data ?? []) {
      result.set(row.province_id, row as AirRow);
    }
    return result;
  },
  120,
);

/** Hourly PM2.5 history for a province over the past `hours`. */
export async function getAirHistory(provinceId: string, hours: number): Promise<TimePoint[]> {
  if (!isSupabaseConfigured) return [];
  const latest = await getLatestObservedAt();
  if (!latest) return [];
  const since = new Date(new Date(latest).getTime() - hours * 3600_000).toISOString();
  const { data, error } = await getServiceSupabase()
    .from("air_quality_hourly")
    .select("observed_at, pm25, pm10, aqi")
    .eq("province_id", provinceId)
    .gte("observed_at", since)
    .order("observed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    t: r.observed_at,
    pm25: r.pm25,
    pm10: r.pm10,
    aqi: r.aqi,
  }));
}
