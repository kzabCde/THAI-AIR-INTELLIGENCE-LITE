"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type { AnalyticsResult } from "@/services/analytics.service";
import type { DailyPoint } from "@/services/daily-summary.service";

export function useHistory(provinceId: string, days = 30, enabled = true) {
  return useQuery({
    queryKey: queryKeys.history(provinceId, days),
    queryFn: ({ signal }) =>
      fetchJson<{ provinceId: string; days: number; history: DailyPoint[] }>(
        `/api/history?province=${provinceId}&days=${days}`,
        signal,
      ),
    enabled: enabled && Boolean(provinceId),
    staleTime: 5 * 60_000,
  });
}

export function useAnalytics(provinceId: string, from: string, to: string, enabled = true) {
  const rangeDays = Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / 86400_000,
  );
  return useQuery({
    queryKey: queryKeys.analytics(provinceId, rangeDays),
    queryFn: ({ signal }) =>
      fetchJson<AnalyticsResult>(
        `/api/analytics?province=${provinceId}&from=${from}&to=${to}`,
        signal,
      ),
    enabled,
    staleTime: 5 * 60_000,
  });
}
