import "server-only";

import type { Tables } from "@/lib/supabase/database.types";
import { cachedQuery, getSupabase, isSupabaseConfigured } from "./_db";

export type HotspotRow = Tables<"hotspot_daily">;

/** Latest known hotspot record per province (fire season data may be stale). */
export const getLatestHotspotByProvince = cachedQuery(
  ["latest-hotspot-all"],
  async (): Promise<Map<string, HotspotRow>> => {
    const result = new Map<string, HotspotRow>();
    if (!isSupabaseConfigured) return result;
    // Most recent 60 days covers a generous window; dedupe to latest per province.
    const { data, error } = await getSupabase()
      .from("hotspot_daily")
      .select("*")
      .order("date", { ascending: false })
      .limit(20 * 60);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!result.has(row.province_id)) result.set(row.province_id, row);
    }
    return result;
  },
  60 * 60,
);

export async function getHotspotHistory(
  provinceId: string,
  days: number,
): Promise<{ date: string; count: number; frp: number }[]> {
  if (!isSupabaseConfigured) return [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const { data, error } = await getSupabase()
    .from("hotspot_daily")
    .select("date, hotspot_count, total_frp")
    .eq("province_id", provinceId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.date,
    count: r.hotspot_count ?? 0,
    frp: r.total_frp ?? 0,
  }));
}
