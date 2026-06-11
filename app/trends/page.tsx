import type { Metadata } from "next";
import { getProvince } from "@/lib/isan";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getDailyHistory,
  getMonthlyAverages,
  getSeasonalAverages,
} from "@/services/daily-summary.service";
import { Section, CardHeader } from "@/components/ui/card";
import { HistoryCard } from "@/components/province/province-charts";
import { CategoryBars } from "@/components/charts/category-bars";
import { ProvinceSelect } from "@/components/controls/province-select";
import { NotConfiguredState, ErrorState, EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "แนวโน้มย้อนหลัง" };
export const revalidate = 300;

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string }>;
}) {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  const { province: pParam } = await searchParams;
  const province = getProvince(pParam ?? "TH-40") ?? getProvince("TH-40")!;

  let daily, monthly, seasonal;
  try {
    [daily, monthly, seasonal] = await Promise.all([
      getDailyHistory(province.id, 90),
      getMonthlyAverages(province.id, 12),
      getSeasonalAverages(province.id),
    ]);
  } catch {
    return <ErrorState />;
  }

  const monthlyBars = monthly.map((m) => ({
    label: MONTH_LABELS[Number(m.month.slice(5, 7)) - 1] ?? m.month,
    value: m.pm25,
  }));
  const seasonalBars = seasonal.map((s) => ({ label: s.seasonTh, value: s.pm25 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">แนวโน้มย้อนหลัง</h1>
          <p className="muted text-sm">{province.nameTh} · ค่าเฉลี่ยรายวัน รายเดือน และตามฤดูกาล</p>
        </div>
        <ProvinceSelect value={province.id} />
      </div>

      <HistoryCard daily={daily.map((d) => ({ date: d.date, pm25: d.pm25 }))} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <CardHeader title="ค่าเฉลี่ยรายเดือน" description="12 เดือนล่าสุด (µg/m³)" />
          <div className="card-pad">
            {monthlyBars.length ? <CategoryBars data={monthlyBars} /> : <EmptyState />}
          </div>
        </div>
        <div className="card">
          <CardHeader title="เปรียบเทียบตามฤดูกาล" description="ฤดูเผา (แล้ง) มักมีค่าฝุ่นสูงสุด" />
          <div className="card-pad">
            {seasonalBars.some((s) => s.value > 0) ? <CategoryBars data={seasonalBars} /> : <EmptyState />}
          </div>
        </div>
      </div>

      <Section title="สรุปฤดูกาล" description="ค่าเฉลี่ย PM2.5 และจำนวนวันที่เก็บข้อมูล">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {seasonal.map((s) => (
            <div key={s.season} className="card card-pad">
              <p className="section-title">{s.seasonTh}</p>
              <p className="stat-value mt-1">{s.pm25.toFixed(1)}<span className="muted ml-1 text-base">µg/m³</span></p>
              <p className="muted text-xs">{s.samples} วันข้อมูล</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
