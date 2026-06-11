"use client";

import { ZONE_LABELS } from "@/lib/isan";
import type { RegionOverview } from "@/services/types";
import { useOverview } from "@/hooks/use-overview";
import { ProvinceTable, type ProvinceRow } from "./province-table";

/**
 * Client wrapper around the province ranking table. Hydrates from the server's
 * ISR snapshot (`initial`) and then stays live via React Query + Supabase
 * Realtime invalidation — re-rendering only the rows, not the whole page.
 */
export function LiveProvinceTable({ initial }: { initial: RegionOverview }) {
  const { data } = useOverview(initial);
  const snapshots = data?.snapshots ?? initial.snapshots;

  const rows: ProvinceRow[] = snapshots.map((s) => ({
    id: s.province.id,
    nameTh: s.province.nameTh,
    nameEn: s.province.nameEn,
    zoneTh: ZONE_LABELS[s.province.zone].th,
    pm25: s.pm25,
    aqi: s.aqi,
    color: s.band.color,
    labelTh: s.band.labelTh,
    temp: s.temperature,
    humidity: s.humidity,
    wind: s.windSpeed,
    hotspots: s.hotspotCount,
    delta: s.pm25Delta,
  }));

  return <ProvinceTable rows={rows} />;
}
