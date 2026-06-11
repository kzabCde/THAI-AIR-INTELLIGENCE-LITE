"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  getLatestHotspots,
  getProvinceHotspots,
} from "@/services/supabase/hotspot.service";
import type { HotspotRow } from "@/services/supabase/hotspot.service";

export type { HotspotRow };

/** Latest hotspot counts for all provinces. */
export function useHotspots() {
  return useQuery({
    queryKey: queryKeys.hotspots(),
    queryFn: () => getLatestHotspots(),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

/** Latest hotspot record for a single province. */
export function useProvinceHotspots(provinceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.hotspots(provinceId),
    queryFn: () => getProvinceHotspots(provinceId),
    enabled: enabled && Boolean(provinceId),
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}
