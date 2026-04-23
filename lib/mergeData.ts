import type { AirReading, WeatherReading } from "@/types/air";

export function mergeData<T extends { slug: string }>(
  base: T[],
  airMap: Record<string, AirReading>,
  weatherMap: Record<string, WeatherReading>,
  hotspotMap: Record<string, number>,
) {
  return base.map((row) => ({
    ...row,
    air: airMap[row.slug],
    weather: weatherMap[row.slug],
    hotspot_count: hotspotMap[row.slug] ?? 0,
  }));
}
