import type { Metadata } from "next";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { pm25ToAqi, aqiToGradientColor } from "@/lib/aqi";
import { getRegionOverview } from "@/services/overview.service";
import { MapPageDashboard } from "@/components/map/map-page-dashboard";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";
import type { MapProvince } from "@/components/map/types";

export const metadata: Metadata = {
  title: "แผนที่คุณภาพอากาศภาคอีสาน | Isan Air Intelligence",
  description: "แผนที่แสดงค่า PM2.5 AQI จุดความร้อน FIRMS และทิศทางลม 20 จังหวัดภาคอีสานแบบเรียลไทม์",
};

export const revalidate = 300;

export default async function MapPage() {
  if (!isSupabaseConfigured) return <NotConfiguredState />;

  let overview;
  try {
    overview = await getRegionOverview();
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState description="ไม่สามารถเชื่อมต่อฐานข้อมูล Supabase ได้" />;
  }

  const mapProvinces: MapProvince[] = overview.snapshots.map((s) => ({
    id: s.province.id,
    slug: s.province.slug,
    nameTh: s.province.nameTh,
    nameEn: s.province.nameEn,
    lat: s.province.lat,
    lon: s.province.lon,
    pm25: s.pm25,
    aqi: s.aqi,
    color: aqiToGradientColor(s.aqi ?? pm25ToAqi(s.pm25 ?? 0)),
    labelTh: s.band.labelTh,
    temperature: s.temperature,
    humidity: s.humidity,
    windSpeed: s.windSpeed,
    windDirection: s.windDirection,
    observedAt: s.observedAt,
  }));

  return (
    <MapPageDashboard
      overview={overview}
      mapProvinces={mapProvinces}
    />
  );
}
