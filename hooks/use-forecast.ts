"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type { ProvinceForecast } from "@/services/types";
import { useUiStore } from "@/stores/ui-store";

/** Safety-net polling cadence used only when realtime can't carry updates. */
const FALLBACK_POLL_MS = 600_000; // 10 minutes

/** 168h hourly + 7d daily PM2.5 forecast for a province. */
export function useForecast(provinceId: string, initialData?: ProvinceForecast) {
  const realtimeStatus = useUiStore((s) => s.realtimeStatus);
  const autoRefresh = useUiStore((s) => s.autoRefresh);

  // Realtime is the primary update path; only poll as a fallback when it isn't
  // delivering changes (offline/disabled) and auto-refresh is on. This avoids
  // redundant fetches while still recovering if the websocket drops.
  const refetchInterval =
    autoRefresh && realtimeStatus !== "live" ? FALLBACK_POLL_MS : (false as const);

  return useQuery({
    queryKey: queryKeys.forecast(provinceId),
    queryFn: ({ signal }) =>
      fetchJson<ProvinceForecast>(`/api/forecast?province=${provinceId}`, signal),
    initialData,
    enabled: Boolean(provinceId),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
    refetchInterval,
  });
}
