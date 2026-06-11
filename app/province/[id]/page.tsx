import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Droplets,
  Flame,
  Gauge,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Wind,
  Navigation,
  Cloud,
  BarChart2,
} from "lucide-react";
import { ISAN_PROVINCES, ZONE_LABELS, getProvince } from "@/lib/isan";
import { fmtNumber, fmtPm25, fmtRelativeTh } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getProvinceSnapshot } from "@/services/overview.service";
import { getAirHistory } from "@/services/air-quality.service";
import { getWeatherHistory } from "@/services/weather.service";
import { getDailyHistory } from "@/services/daily-summary.service";
import { getProvinceForecast } from "@/services/forecast.service";
import { KpiCard, DeltaPill } from "@/components/ui/kpi-card";
import { AqiBadge } from "@/components/ui/aqi-badge";
import {
  ForecastCard,
  HistoryCard,
  HourlyAirCard,
  HourlyWeatherCard,
} from "@/components/province/province-charts";
import { NotConfiguredState, ErrorState, NetworkRestrictedState } from "@/components/ui/states";
import { isNetworkRestrictedError } from "@/services/_db";

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

function windDegToTh(deg: number | null): string {
  if (deg == null) return "–";
  const dirs = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
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

  const next24 = forecast.hourly.slice(0, 24);
  const avg24 = next24.length ? next24.reduce((a, p) => a + p.pm25, 0) / next24.length : null;
  const peak72 = forecast.hourly.slice(0, 72).reduce((m, p) => Math.max(m, p.pm25), 0);
  const TrendIcon = forecast.trend === "up" ? TrendingUp : forecast.trend === "down" ? TrendingDown : Wind;

  // Latest weather from snapshot
  const latestWeather = weatherHistory[weatherHistory.length - 1];

  return (
    <div className="space-y-6">
      <Link href="/" className="muted inline-flex items-center gap-1 text-sm hover:text-fg">
        <ArrowLeft size={15} /> ภาพรวม
      </Link>

      {/* Hero header */}
      <div className="card card-pad" style={{ borderTop: `4px solid ${snapshot.band.color}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{province.nameTh}</h1>
            <p className="muted text-sm">
              {province.nameEn} · {ZONE_LABELS[province.zone].th} · {province.id}
            </p>
            <p className="muted mt-1 text-xs">อัปเดต {fmtRelativeTh(snapshot.observedAt)}</p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: snapshot.band.color }}>
                {fmtPm25(snapshot.pm25)}
              </span>
              <span className="muted text-sm">µg/m³</span>
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <AqiBadge band={snapshot.band} aqi={snapshot.aqi} />
              {snapshot.pm25Delta != null && <DeltaPill delta={snapshot.pm25Delta} />}
            </div>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">{snapshot.band.adviceTh}</p>
      </div>

      {/* Air quality metrics */}
      <div>
        <p className="section-title mb-2">คุณภาพอากาศล่าสุด</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="ดัชนีคุณภาพอากาศ" value={snapshot.aqi ?? "–"} unit="AQI" icon={<Gauge size={16} />} accent={snapshot.band.color} />
          <KpiCard label="PM10" value={fmtPm25(snapshot.pm10)} unit="µg/m³" icon={<Gauge size={16} />} />
          <KpiCard label="จุดความร้อน" value={fmtNumber(snapshot.hotspotCount)} unit="จุด" icon={<Flame size={16} />} hint="ดาวเทียม FIRMS" />
        </div>
      </div>

      {/* Weather metrics */}
      <div>
        <p className="section-title mb-2">สภาพอากาศล่าสุด</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard
            label="อุณหภูมิ"
            value={snapshot.temperature != null ? fmtNumber(snapshot.temperature, 1) : "–"}
            unit="°C"
            icon={<Thermometer size={16} />}
          />
          <KpiCard
            label="ความชื้น"
            value={snapshot.humidity != null ? fmtNumber(snapshot.humidity, 0) : "–"}
            unit="%"
            icon={<Droplets size={16} />}
          />
          <KpiCard
            label="ความเร็วลม"
            value={snapshot.windSpeed != null ? fmtNumber(snapshot.windSpeed, 1) : "–"}
            unit="m/s"
            icon={<Wind size={16} />}
          />
          <KpiCard
            label="ทิศลม"
            value={windDegToTh(latestWeather?.windDirection ?? null)}
            hint={latestWeather?.windDirection != null ? `${fmtNumber(latestWeather.windDirection, 0)}°` : ""}
            icon={<Navigation size={16} />}
          />
          <KpiCard
            label="ความกดอากาศ"
            value={latestWeather?.pressure != null ? fmtNumber(latestWeather.pressure, 1) : "–"}
            unit="hPa"
            icon={<BarChart2 size={16} />}
          />
          <KpiCard
            label="ฝน"
            value={snapshot.precipitation != null ? fmtNumber(snapshot.precipitation, 1) : "–"}
            unit="mm"
            icon={<Cloud size={16} />}
          />
        </div>
      </div>

      {/* Forecast summary */}
      <div>
        <p className="section-title mb-2">พยากรณ์</p>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            label="คาดการณ์ 24 ชม."
            value={avg24 != null ? fmtPm25(avg24) : "–"}
            unit="µg/m³"
            hint="เฉลี่ย"
          />
          <KpiCard label="พีค 72 ชม." value={fmtPm25(peak72)} unit="µg/m³" hint="สูงสุด" />
          <KpiCard
            label="แนวโน้ม 7 วัน"
            value={forecast.trend === "up" ? "เพิ่มขึ้น" : forecast.trend === "down" ? "ลดลง" : "คงที่"}
            icon={<TrendIcon size={16} />}
            hint={`โมเดล ${forecast.model}`}
          />
        </div>
      </div>

      {/* Hourly real data charts */}
      {airHistory.length > 0 && <HourlyAirCard hourly={airHistory} />}
      {weatherHistory.length > 0 && <HourlyWeatherCard hourly={weatherHistory} />}

      {/* Forecast chart */}
      <ForecastCard hourly={forecast.hourly} daily={forecast.daily} />

      {/* Daily history with min/max band */}
      <HistoryCard daily={dailyHistory} />

      {airHistory.length > 0 && (
        <p className="muted text-center text-xs">
          ข้อมูลรายชั่วโมง 72 ชม. ล่าสุด {airHistory.length} จุด · ข้อมูลรายวัน {dailyHistory.length} วัน · ฐานข้อมูล Supabase
        </p>
      )}
    </div>
  );
}
