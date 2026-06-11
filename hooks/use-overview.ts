"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import type { RegionOverview } from "@/services/types";

/**
 * Region-wide snapshot (all provinces). Hydrate with server `initialData` so the
 * first paint uses ISR data, then React Query keeps it fresh via realtime
 * invalidation / background revalidation.
 */
export function useOverview(initialData?: RegionOverview) {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: ({ signal }) => fetchJson<RegionOverview>("/api/air-quality", signal),
    initialData,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

/** Hotspot summary derived from the shared overview cache (no extra request). */
export function useHotspots(initialData?: RegionOverview) {
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: ({ signal }) => fetchJson<RegionOverview>("/api/air-quality", signal),
    initialData,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
    select: (data) =>
      data.snapshots
        .map((s) => ({
          provinceId: s.province.id,
          nameTh: s.province.nameTh,
          hotspotCount: s.hotspotCount,
        }))
        .sort((a, b) => b.hotspotCount - a.hotspotCount),
  });
}
