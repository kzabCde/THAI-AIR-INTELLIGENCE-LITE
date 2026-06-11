"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type { Tables } from "@/lib/supabase/database.types";
import type { TimePoint } from "@/services/types";

export type AirRow = Tables<"air_quality_hourly">;

/** Latest PM2.5 / AQI reading for a single province. */
export function useProvinceAir(provinceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.airQuality(provinceId),
    queryFn: ({ signal }) =>
      fetchJson<AirRow | null>(`/api/air-quality?province=${provinceId}`, signal),
    enabled: enabled && Boolean(provinceId),
  });
}

/** Hourly PM2.5 history for charts. */
export function useAirHistory(provinceId: string, hours = 72, enabled = true) {
  return useQuery({
    queryKey: queryKeys.airQuality(provinceId, hours),
    queryFn: ({ signal }) =>
      fetchJson<{ provinceId: string; hours: number; history: TimePoint[] }>(
        `/api/air-quality?province=${provinceId}&hours=${hours}`,
        signal,
      ),
    enabled: enabled && Boolean(provinceId),
    staleTime: 120_000,
  });
}
