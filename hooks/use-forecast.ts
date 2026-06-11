"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type { ProvinceForecast } from "@/services/types";

/** 168h hourly + 7d daily PM2.5 forecast for a province. */
export function useForecast(provinceId: string, initialData?: ProvinceForecast) {
  return useQuery({
    queryKey: queryKeys.forecast(provinceId),
    queryFn: ({ signal }) =>
      fetchJson<ProvinceForecast>(`/api/forecast?province=${provinceId}`, signal),
    initialData,
    enabled: Boolean(provinceId),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}
