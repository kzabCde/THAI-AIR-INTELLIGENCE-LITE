import type { Metadata } from "next";
import { Suspense } from "react";
import { getProvince } from "@/lib/isan";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getProvinceForecast } from "@/services/forecast.service";
import { getLatestWeather } from "@/services/weather.service";
import { getRegionOverview } from "@/services/overview.service";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";
import { RedesignedForecastDashboard } from "@/components/forecast/redesigned-forecast-dashboard";
import { ProvinceRedirect } from "@/components/ui/province-redirect";

/**
 * Forecast Page — Renders real Supabase & ML prediction data with redesigned UI.
 * - ความน่าเชื่อถือของผล: Evaluated D+1 reliability status
 * - วิธีจัดระดับคุณภาพอากาศ: Active 5-class ML classifier vs คำนวณจากค่าพยากรณ์ PM2.5
 */

export const metadata: Metadata = { title: "พยากรณ์คุณภาพอากาศ" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string }>;
}) {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  const { province: pParam } = await searchParams;
  const province = getProvince(pParam ?? "TH-40") ?? getProvince("TH-40")!;

  let forecast, weather, overview;
  try {
    [forecast, weather, overview] = await Promise.all([
      getProvinceForecast(province.id),
      getLatestWeather(province.id),
      getRegionOverview(),
    ]);
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }

  // Full detailed 5-section diagnostic log (Dev-Only, Suppressed automatically in Production)
  if (process.env.NODE_ENV === "development") {
    console.log(`\n================================================================================`);
    console.log(`  [AI AIR INTELLIGENCE - FULL SYSTEM & FORECAST DIAGNOSTIC]`);
    console.log(`  Target Province : ${province.nameTh} (${province.nameEn} - ${province.id})`);
    console.log(`================================================================================`);
    console.log(`  [1. PRIMARY FORECAST] PM2.5: ${forecast.daily[0]?.pm25 ?? 0} ug/m3 | Model: ${forecast.models.regression.name}`);
    console.log(`  [2. SYSTEM STATUS] Regression: ${forecast.models.regression.eligible ? "READY" : "FALLBACK"} | Classifier: ${forecast.models.classification?.name ?? "Threshold"}`);
    console.log(`  [3. WEATHER LIVE] Temp: ${weather?.temperature ?? "-"} C | Humidity: ${weather?.humidity ?? "-"} % | Wind: ${weather?.wind_speed ?? "-"} m/s`);
    console.log(`================================================================================\n`);
  }

  return (
    <>
      <Suspense fallback={null}>
        <ProvinceRedirect />
      </Suspense>
      <RedesignedForecastDashboard
        province={province}
        forecast={forecast}
        weather={weather}
        overview={overview}
      />
    </>
  );
}
