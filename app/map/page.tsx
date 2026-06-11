import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRegionOverview } from "@/services/overview.service";
import { IsanMapCard } from "@/components/map/isan-map-card";
import { NotConfiguredState, ErrorState } from "@/components/ui/states";
import type { MapProvince } from "@/components/map/types";
import { fmtPm25, fmtRelativeTh } from "@/lib/format";

export const metadata: Metadata = { title: "แผนที่คุณภาพอากาศ" };
export const revalidate = 300;

export default async function MapPage() {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  let overview;
  try {
    overview = await getRegionOverview();
  } catch {
    return <ErrorState />;
  }

  const provinces: MapProvince[] = overview.snapshots.map((s) => ({
    id: s.province.id,
    slug: s.province.slug,
    nameTh: s.province.nameTh,
    nameEn: s.province.nameEn,
    lat: s.province.lat,
    lon: s.province.lon,
    pm25: s.pm25,
    aqi: s.aqi,
    color: s.band.color,
    labelTh: s.band.labelTh,
    temperature: s.temperature,
    humidity: s.humidity,
    windSpeed: s.windSpeed,
    observedAt: s.observedAt,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">แผนที่ภาคอีสาน</h1>
          <p className="muted text-sm">
            PM2.5 เฉลี่ย {fmtPm25(overview.avgPm25)} µg/m³ · อัปเดต {fmtRelativeTh(overview.observedAt)}
          </p>
        </div>
      </div>
      <IsanMapCard provinces={provinces} height="h-[68vh]" />
    </div>
  );
}
