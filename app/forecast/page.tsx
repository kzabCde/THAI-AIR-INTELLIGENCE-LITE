import type { Metadata } from "next";
import { CalendarClock, Gauge, Target, TrendingDown, TrendingUp, Wind } from "lucide-react";
import { getProvince } from "@/lib/isan";
import { pm25ToAqi, bandForPm25 } from "@/lib/aqi";
import { fmtPm25, fmtDateTh } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getProvinceForecast } from "@/services/forecast.service";
import { KpiCard } from "@/components/ui/kpi-card";
import { Section } from "@/components/ui/card";
import { ForecastCard } from "@/components/province/province-charts";
import { ProvinceSelect } from "@/components/controls/province-select";
import { NotConfiguredState, ErrorState } from "@/components/ui/states";

export const metadata: Metadata = { title: "พยากรณ์คุณภาพอากาศ" };
export const revalidate = 300;

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string }>;
}) {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  const { province: pParam } = await searchParams;
  const province = getProvince(pParam ?? "TH-30") ?? getProvince("TH-30")!;

  let forecast;
  try {
    forecast = await getProvinceForecast(province.id);
  } catch {
    return <ErrorState />;
  }

  const current = forecast.current ?? 0;
  const next24 = forecast.hourly.slice(0, 24);
  const avg24 = next24.length ? next24.reduce((a, p) => a + p.pm25, 0) / next24.length : 0;
  const avgConfidence = forecast.daily.length
    ? forecast.daily.reduce((a, p) => a + p.confidence, 0) / forecast.daily.length
    : 0;
  const TrendIcon = forecast.trend === "up" ? TrendingUp : forecast.trend === "down" ? TrendingDown : Wind;
  const trendLabel = forecast.trend === "up" ? "แนวโน้มเพิ่มขึ้น" : forecast.trend === "down" ? "แนวโน้มลดลง" : "ทรงตัว";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">พยากรณ์ PM2.5</h1>
          <p className="muted text-sm">ขอบฟ้าพยากรณ์ 168 ชั่วโมง · โมเดล {forecast.model}</p>
        </div>
        <ProvinceSelect value={province.id} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="ค่าปัจจุบัน" value={fmtPm25(current)} unit="µg/m³" icon={<Gauge size={16} />} accent={bandForPm25(current).color} hint={`AQI ${pm25ToAqi(current)}`} />
        <KpiCard label="คาดการณ์ 24 ชม." value={fmtPm25(avg24)} unit="µg/m³" icon={<CalendarClock size={16} />} accent={bandForPm25(avg24).color} hint={`AQI ${pm25ToAqi(avg24)} (เฉลี่ย)`} />
        <KpiCard label="ทิศทางแนวโน้ม" value={trendLabel} icon={<TrendIcon size={16} />} hint="เทียบ 7 วันข้างหน้า" />
        <KpiCard label="ระดับความเชื่อมั่น" value={`${Math.round(avgConfidence * 100)}`} unit="%" icon={<Target size={16} />} hint="เฉลี่ยตลอดช่วงพยากรณ์" />
      </div>

      <ForecastCard hourly={forecast.hourly} daily={forecast.daily} />

      <Section title="พยากรณ์รายวัน 7 วัน" description="ค่าเฉลี่ยและช่วงความเชื่อมั่น">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b border-border text-left text-xs">
                <th className="px-4 py-2.5 font-medium">วันที่</th>
                <th className="px-4 py-2.5 text-right font-medium">PM2.5 เฉลี่ย</th>
                <th className="px-4 py-2.5 text-right font-medium">สูงสุด</th>
                <th className="px-4 py-2.5 text-center font-medium">ระดับ</th>
                <th className="px-4 py-2.5 text-right font-medium">ความเชื่อมั่น</th>
              </tr>
            </thead>
            <tbody>
              {forecast.daily.map((d) => {
                const band = bandForPm25(d.pm25);
                return (
                  <tr key={d.t} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5">{fmtDateTh(d.t)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtPm25(d.pm25)}</td>
                    <td className="muted px-4 py-2.5 text-right tabular-nums">{fmtPm25(d.pm25Max ?? null)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: band.color }}>
                        {band.labelTh}
                      </span>
                    </td>
                    <td className="muted px-4 py-2.5 text-right tabular-nums">{Math.round(d.confidence * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
