import "server-only";

import { unstable_cache } from "next/cache";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

export { getSupabase, getServiceSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Wrap a server-side query in Next's data cache. Keeps the database from being
 * hit on every render while still revalidating on a sensible interval.
 */
export function cachedQuery<T>(
  keyParts: string[],
  fn: () => Promise<T>,
  revalidate = 300,
): () => Promise<T> {
  return unstable_cache(fn, ["isan", ...keyParts], { revalidate, tags: ["isan-data"] });
}

/** Resolve the most recent hourly timestamp present in the dataset.
 *  Uses service-role because air_quality_hourly is an internal table (RLS USING(false) for anon). */
export const getLatestObservedAt = cachedQuery(
  ["latest-observed-at"],
  async (): Promise<string | null> => {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await getServiceSupabase()
      .from("air_quality_hourly")
      .select("observed_at")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.observed_at ?? null;
  },
  120,
);

export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function dateDaysAgo(days: number, from: Date = new Date()): string {
  return isoDaysAgo(days, from).slice(0, 10);
}
