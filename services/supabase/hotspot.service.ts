"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type HotspotRow = Tables<"hotspot_daily">;

/** Latest hotspot record for every province (deduplicated, last 7 days). */
export async function getLatestHotspots(): Promise<HotspotRow[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const { data, error } = await sb
    .from("hotspot_daily")
    .select("*")
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return (data ?? []).filter((r: HotspotRow) => {
    if (seen.has(r.province_id)) return false;
    seen.add(r.province_id);
    return true;
  });
}

/** Latest hotspot record for a single province. */
export async function getProvinceHotspots(province: string): Promise<HotspotRow | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("hotspot_daily")
    .select("*")
    .eq("province_id", province)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Hotspot counts for a province over the past `days`. */
export async function getHotspotHistory(
  province: string,
  days = 30,
): Promise<HotspotRow[]> {
  const sb = getBrowserSupabase();
  if (!sb) return [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const { data, error } = await sb
    .from("hotspot_daily")
    .select("*")
    .eq("province_id", province)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
