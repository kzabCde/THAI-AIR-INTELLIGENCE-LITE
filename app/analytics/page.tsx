import type { Metadata } from "next";
import { AlertTriangle, Calendar, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { getProvince } from "@/lib/isan";
import { bandForPm25 } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getAnalytics } from "@/services/analytics.service";
import { KpiCard } from "@/components/ui/kpi-card";
import { CardHeader } from "@/components/ui/card";
import { TrendArea } from "@/components/charts/trend-area";
import { ProvinceSelect } from "@/components/controls/province-select";
import { RangePresets } from "@/components/controls/range-presets";
import { NotConfiguredState, ErrorState, EmptyState , NetworkRestrictedState } from "@/components/ui/states";

export const metadata: Metadata = { title: "วิเคราะห์ข้อมูล" };
export const revalidate = 300;

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string; range?: string }>;
}) {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  const sp = await searchParams;
  const provinceId = sp.province ?? "all";
  const province = provinceId === "all" ? null : getProvince(provinceId);
  const rangeDays = Math.min(365, Math.max(7, Number(sp.range) || 90));

  const today = new Date();
  const from = new Date(today.getTime() - rangeDays * 86400_000);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = today.toISOString().slice(0, 10);

  let result;
  try {
    result = await getAnalytics({ provinceId: province?.id ?? "all", from: fromStr, to: toStr });
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }

  const series = result.series.map((s) => ({ label: dayLabel(s.date), value: s.pm25 }));
  const { stats } = result;
  const exceedancePct = stats.days ? Math.round((stats.exceedanceDays / stats.days) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">วิเคราะห์ข้อมูลย้อนหลัง</h1>
        <p className="muted text-sm">
          {province ? province.nameTh : "ทั้งภูมิภาคอีสาน"} · {rangeDays} วันล่าสุด
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProvinceSelect value={provinceId} includeAll />
        <RangePresets value={String(rangeDays)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="ค่าเฉลี่ย" value={fmtPm25(stats.avg)} unit="µg/m³" icon={<Gauge size={16} />} accent={bandForPm25(stats.avg).color} />
        <KpiCard label="สูงสุด" value={fmtPm25(stats.max)} unit="µg/m³" icon={<TrendingUp size={16} />} accent={bandForPm25(stats.max).color} />
        <KpiCard label="ต่ำสุด" value={fmtPm25(stats.min)} unit="µg/m³" icon={<TrendingDown size={16} />} accent={bandForPm25(stats.min).color} />
        <KpiCard label="วันเกินมาตรฐาน" value={stats.exceedanceDays} unit={`/${stats.days} วัน`} icon={<AlertTriangle size={16} />} hint={`${exceedancePct}% · เกณฑ์ 37.5 µg/m³`} />
      </div>

      <div className="card">
        <CardHeader
          title="แนวโน้ม PM2.5 รายวัน"
          description={`${fromStr} ถึง ${toStr}`}
          action={<Calendar size={16} className="muted" />}
        />
        <div className="card-pad">
          {series.length ? (
            <TrendArea
              data={series}
              height={300}
              thresholds={[{ y: 37.5, label: "เกณฑ์ไทย", color: "#f97316" }]}
            />
          ) : (
            <EmptyState description="ไม่มีข้อมูลในช่วงเวลาที่เลือก" />
          )}
        </div>
      </div>
    </div>
  );
}
