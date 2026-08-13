import "server-only";

import { bandForAqi, bandForCategory, bandForPm25, pm25ToAqi } from "@/lib/aqi";
import { ISAN_PROVINCES, getProvince } from "@/lib/isan";
import { getLatestAir, getLatestAirByProvince } from "./air-quality.service";
import { getLatestWeather, getLatestWeatherByProvince, get24hPrecipitationByProvince } from "./weather.service";
import { getLatestHotspotByProvince } from "./hotspot.service";
import { getYesterdayMeanByProvince } from "./daily-summary.service";
import type { ProvinceSnapshot, RegionOverview } from "./types";

/** Build the full region overview: one merged snapshot per Isan province. */
export async function getRegionOverview(): Promise<RegionOverview> {
  // Use allSettled so a failure in one data source (weather, hotspot, etc.)
  // does not discard the air quality data that loaded successfully.
  const [airResult, weatherResult, hotspotResult, yesterdayResult, precip24hResult] = await Promise.allSettled([
    getLatestAirByProvince(),
    getLatestWeatherByProvince(),
    getLatestHotspotByProvince(),
    getYesterdayMeanByProvince(),
    get24hPrecipitationByProvince(),
  ]);

  // If the primary air-quality query failed, propagate the error so the page
  // can show its ErrorState. Auxiliary failures degrade gracefully to empty maps.
  if (airResult.status === "rejected") throw airResult.reason;

  const air = airResult.value;
  const weather = weatherResult.status === "fulfilled" ? weatherResult.value : new Map();
  const hotspot = hotspotResult.status === "fulfilled" ? hotspotResult.value : new Map();
  const yesterday = yesterdayResult.status === "fulfilled" ? yesterdayResult.value : new Map();
  const precip24h = precip24hResult.status === "fulfilled" ? precip24hResult.value : new Map();

  let observedAt: string | null = null;
  let hotspotDate: string | null = null;
  const snapshots: ProvinceSnapshot[] = ISAN_PROVINCES.map((province) => {
    const a = air.get(province.id);
    const w = weather.get(province.id);
    const h = hotspot.get(province.id);
    const pm25 = a?.pm25 ?? null;
    const aqi = pm25 != null ? pm25ToAqi(pm25) : (a?.aqi ?? null);
    const prev = yesterday.get(province.id);
    if (a?.observed_at && (!observedAt || a.observed_at > observedAt)) observedAt = a.observed_at;
    if (h?.date && (!hotspotDate || h.date > hotspotDate)) hotspotDate = h.date;

    return {
      province,
      observedAt: a?.observed_at ?? null,
      pm25,
      pm10: a?.pm10 ?? null,
      aqi,
      category: a?.aqi_category ?? null,
      band: pm25 != null ? bandForPm25(pm25) : (aqi != null ? bandForAqi(aqi) : bandForCategory(a?.aqi_category, pm25 ?? 0)),
      temperature: w?.temperature ?? null,
      humidity: w?.humidity ?? null,
      windSpeed: w?.wind_speed ?? null,
      windDirection: w?.wind_direction ?? null,
      precipitation: w?.precipitation ?? null,
      precipitation24h: precip24h.get(province.id) ?? null,
      hotspotCount: h?.hotspot_count ?? 0,
      hotspotDate: h?.date ?? null,
      pm25Delta: pm25 != null && prev != null ? +(pm25 - prev).toFixed(1) : null,
    };
  });

  const withPm = snapshots.filter((s) => s.pm25 != null);
  const avgPm25 = withPm.length
    ? +(withPm.reduce((a, s) => a + (s.pm25 ?? 0), 0) / withPm.length).toFixed(1)
    : 0;
  const avgAqi = withPm.length
    ? Math.round(withPm.reduce((a, s) => a + (s.aqi ?? 0), 0) / withPm.length)
    : 0;
  const sorted = [...withPm].sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0));
  const levelCounts = [0, 0, 0, 0, 0, 0];
  for (const s of withPm) levelCounts[s.band.level] += 1;

  // High-visibility terminal status check (Dev-Only, Suppressed automatically in Production)
  if (process.env.NODE_ENV === "development") {
    console.log(`\n================================================================================`);
    console.log(`  [REGION OVERVIEW SYSTEM CHECK] — 20 Isan Provinces Overview`);
    console.log(`================================================================================`);
    console.log(`  [✓] Provinces Status Loaded   : ${ISAN_PROVINCES.length} / 20 Provinces Ready`);
    console.log(`  [📊] Regional Average PM2.5    : ${avgPm25} ug/m3 (AQI ${avgAqi})`);
    console.log(`  [⚠️] Highest Air Risk Area     : ${sorted[0]?.province.nameTh ?? "N/A"} (${sorted[0]?.pm25 ?? 0} ug/m3)`);
    console.log(`  [🔥] Active Hotspot Count     : ${snapshots.reduce((a, s) => a + s.hotspotCount, 0)} Points`);
    console.log(`  [⚡] Observed Data Stream Time : ${observedAt ?? "Live Stream"}`);
    console.log(`================================================================================\n`);
  }

  return {
    observedAt,
    provinceCount: ISAN_PROVINCES.length,
    avgPm25,
    avgAqi,
    worst: sorted[0] ?? null,
    best: sorted[sorted.length - 1] ?? null,
    totalHotspots: snapshots.reduce((a, s) => a + s.hotspotCount, 0),
    hotspotDate,
    levelCounts,
    snapshots,
  };
}

/** Single-province snapshot (province detail header). */
export async function getProvinceSnapshot(provinceId: string): Promise<ProvinceSnapshot | null> {
  const province = getProvince(provinceId);
  if (!province) return null;
  const [a, w, hotspot, yesterday, precip24h] = await Promise.all([
    getLatestAir(province.id),
    getLatestWeather(province.id),
    getLatestHotspotByProvince(),
    getYesterdayMeanByProvince(),
    get24hPrecipitationByProvince(),
  ]);
  const pm25 = a?.pm25 ?? null;
  const aqi = pm25 != null ? pm25ToAqi(pm25) : (a?.aqi ?? null);
  const prev = yesterday.get(province.id);
  return {
    province,
    observedAt: a?.observed_at ?? null,
    pm25,
    pm10: a?.pm10 ?? null,
    aqi,
    category: a?.aqi_category ?? null,
    band: pm25 != null ? bandForPm25(pm25) : (aqi != null ? bandForAqi(aqi) : bandForCategory(a?.aqi_category, pm25 ?? 0)),
    temperature: w?.temperature ?? null,
    humidity: w?.humidity ?? null,
    windSpeed: w?.wind_speed ?? null,
    windDirection: w?.wind_direction ?? null,
    precipitation: w?.precipitation ?? null,
    precipitation24h: precip24h.get(province.id) ?? null,
    hotspotCount: hotspot.get(province.id)?.hotspot_count ?? 0,
    hotspotDate: hotspot.get(province.id)?.date ?? null,
    pm25Delta: pm25 != null && prev != null ? +(pm25 - prev).toFixed(1) : null,
  };
}
