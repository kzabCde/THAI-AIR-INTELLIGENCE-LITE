import type { Metadata } from "next";
import { Suspense } from "react";
import { getProvince } from "@/lib/isan";
import { isNetworkRestrictedError } from "@/services/_db";
import { isServiceSupabaseConfigured, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getLatestCompletedBangkokDate,
  getRegionalProvinceRankings,
  getRegionalTrendHistory,
  getTrendHistory,
} from "@/services/daily-summary.service";
import { TrendsDashboard } from "@/components/trends/trends-dashboard";
import {
  ErrorState,
  NetworkRestrictedState,
  NotConfiguredState,
} from "@/components/ui/states";
import { ProvinceRedirect } from "@/components/ui/province-redirect";

export const metadata: Metadata = { title: "แนวโน้มย้อนหลัง" };
export const revalidate = 300;

const ALLOWED_RANGES = new Set([7, 30, 90, 180, 365]);

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string; range?: string }>;
}) {
  if (!isSupabaseConfigured || !isServiceSupabaseConfigured) return <NotConfiguredState />;

  try {
    const params = searchParams ? await Promise.resolve(searchParams) : {};
    const isRegional = params.province === "all";
    const province = isRegional
      ? null
      : (getProvince(params.province ?? "TH-40") ?? getProvince("TH-40")!);
    const requestedRange = Number(params.range);
    const rangeDays = ALLOWED_RANGES.has(requestedRange) ? requestedRange : 90;

    const throughDate = getLatestCompletedBangkokDate();
    const [history, rankings] = await Promise.all([
      isRegional
        ? getRegionalTrendHistory(730, throughDate)
        : getTrendHistory(province!.id, 730, throughDate),
      getRegionalProvinceRankings(rangeDays, throughDate),
    ]);

    return (
      <>
        <Suspense fallback={null}>
          <ProvinceRedirect />
        </Suspense>
        <TrendsDashboard
          province={province}
          history={history}
          rangeDays={rangeDays}
          throughDate={throughDate}
          viewMode={isRegional ? "regional" : "province"}
          rankings={rankings}
        />
      </>
    );
  } catch (error) {
    if (isNetworkRestrictedError(error)) return <NetworkRestrictedState />;
    return <ErrorState description="ไม่สามารถโหลดข้อมูลแนวโน้มย้อนหลังจาก Supabase ได้" />;
  }
}
