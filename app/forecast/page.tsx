import type { Metadata } from "next";
import { Suspense } from "react";
import { getProvince } from "@/lib/isan";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getProvinceForecast } from "@/services/forecast.service";
import { getLatestWeather } from "@/services/weather.service";
import { getRegionOverview } from "@/services/overview.service";
import { getRegionalForecast } from "@/services/regional-forecast.service";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";
import { ForecastTabsShell } from "@/components/forecast/forecast-tabs-shell";
import { ProvinceRedirect } from "@/components/ui/province-redirect";

/**
 * Forecast Page — Two tabs:
 * 1. "ทั้งภาคอีสาน" — regional heatmap of all 20 provinces
 * 2. "รายจังหวัด" — detailed per-province forecast (existing)
 */

export const metadata: Metadata = {
  title: "พยากรณ์คุณภาพอากาศ",
  description:
    "พยากรณ์ PM2.5 พร้อมความน่าเชื่อถือของผล วิธีจัดระดับคุณภาพอากาศ และระดับที่คำนวณจากค่าพยากรณ์ PM2.5",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string; tab?: string }>;
}) {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  const { province: pParam, tab } = await searchParams;
  const province = getProvince(pParam ?? "TH-40") ?? getProvince("TH-40")!;

  let forecast, weather, overview, regionalForecast;
  try {
    [forecast, weather, overview, regionalForecast] = await Promise.all([
      getProvinceForecast(province.id),
      getLatestWeather(province.id),
      getRegionOverview(),
      getRegionalForecast(),
    ]);
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }

  // Full detailed diagnostic log (Dev-Only)
  if (process.env.NODE_ENV === "development") {
    console.log(`\n================================================================================`);
    console.log(`  [AI AIR INTELLIGENCE - FULL SYSTEM & FORECAST DIAGNOSTIC]`);
    console.log(`  Target Province : ${province.nameTh} (${province.nameEn} - ${province.id})`);
    console.log(`================================================================================`);
    console.log(`  [1. PRIMARY FORECAST] PM2.5: ${forecast.daily[0]?.pm25 ?? 0} ug/m3 | Model: ${forecast.models.regression.name}`);
    console.log(`  [2. SYSTEM STATUS] Regression: ${forecast.models.regression.eligible ? "READY" : "FALLBACK"} | Classifier: ${forecast.models.classification?.name ?? "Threshold"}`);
    console.log(`  [3. WEATHER LIVE] Temp: ${weather?.temperature ?? "-"} C | Humidity: ${weather?.humidity ?? "-"} % | Wind: ${weather?.wind_speed ?? "-"} m/s`);
    console.log(`  [4. REGIONAL] ${regionalForecast.entries.length} provinces loaded | Avg D+1: ${regionalForecast.avgPm25D1} µg/m³`);
    console.log(`================================================================================\n`);
  }

  return (
    <>
      <Suspense fallback={null}>
        <ProvinceRedirect page="forecast" />
      </Suspense>
      <ForecastTabsShell
        province={province}
        forecast={forecast}
        weather={weather}
        overview={overview}
        regionalForecast={regionalForecast}
        initialTab={tab === "province" ? "province" : "regional"}
      />
    </>
  );
}
