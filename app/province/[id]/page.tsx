import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Flame,
  Gauge,
} from "lucide-react";
import { ISAN_PROVINCES, ZONE_LABELS, getProvince } from "@/lib/isan";
import { fmtDateTh, fmtNumber, fmtPm25, isHotspotDataStale } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getProvinceSnapshot } from "@/services/overview.service";
import { getAirHistory } from "@/services/air-quality.service";
import { getWeatherHistory } from "@/services/weather.service";
import { getDailyHistory } from "@/services/daily-summary.service";
import { getProvinceForecast } from "@/services/forecast.service";
import {
  ForecastCard,
  HistoryCard,
  HourlyAirCard,
  HourlyWeatherCard,
} from "@/components/province/province-charts";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";
import { isNetworkRestrictedError } from "@/services/_db";
import { ProvinceDetailDashboard } from "@/components/province/province-detail-dashboard";

export const revalidate = 300;

export function generateStaticParams() {
  return ISAN_PROVINCES.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const province = getProvince(id);
  return { title: province ? `${province.nameTh} (${province.nameEn})` : "จังหวัด" };
}

export default async function ProvinceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const province = getProvince(id);
  if (!province) notFound();
  if (!isSupabaseConfigured) return <NotConfiguredState />;

  let snapshot, airHistory, weatherHistory, dailyHistory, forecast;
  try {
    [snapshot, airHistory, weatherHistory, dailyHistory, forecast] = await Promise.all([
      getProvinceSnapshot(province.id),
      getAirHistory(province.id, 72),
      getWeatherHistory(province.id, 72),
      getDailyHistory(province.id, 90),
      getProvinceForecast(province.id),
    ]);
  } catch (err) {
    console.error(`[province/${province.id}] load error:`, err);
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }
  if (!snapshot) return <ErrorState description="ไม่พบข้อมูลของจังหวัดนี้" />;

  return (
    <ProvinceDetailDashboard
      snapshot={snapshot}
      airHistory={airHistory}
      weatherHistory={weatherHistory}
      dailyHistory={dailyHistory}
      forecast={forecast}
    />
  );
}
