import type { Metadata } from "next";
import { AlertTriangle, BrainCircuit, CalendarClock, CheckCircle2, Droplets, Gauge, Target, Thermometer, TrendingDown, TrendingUp, Wind } from "lucide-react";
import { getProvince } from "@/lib/isan";
import { pm25ToAqi, bandForPm25 } from "@/lib/aqi";
import { fmtNumber, fmtPm25, fmtDateTh } from "@/lib/format";
import { isNetworkRestrictedError } from "@/services/_db";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getProvinceForecast } from "@/services/forecast.service";
import { getLatestWeather } from "@/services/weather.service";
import { KpiCard } from "@/components/ui/kpi-card";
import { Section } from "@/components/ui/card";
import { ForecastCard } from "@/components/province/province-charts";
import { ProvinceSelect } from "@/components/controls/province-select";
import { NotConfiguredState, ErrorState , NetworkRestrictedState } from "@/components/ui/states";
import { RelativeTime } from "@/components/ui/relative-time";
import { pm25ClassDefinition } from "@/lib/pm25-classification";

export const metadata: Metadata = { title: "พยากรณ์คุณภาพอากาศ" };
export const revalidate = 300;

function confidenceStatus(value: number | null | undefined) {
  if (value == null) {
    return {
      label: "กำลังประเมิน",
      hint: "ระบบจะแสดงสถานะเมื่อมีข้อมูลเพียงพอ",
    };
  }
  if (value >= 0.8) {
    return {
      label: "สูง",
      hint: "แนวโน้มช่วงใกล้มีความชัดเจน",
    };
  }
  if (value >= 0.6) {
    return {
      label: "ปานกลาง",
      hint: "ควรติดตามข้อมูลล่าสุดประกอบ",
    };
  }
  return {
    label: "ควรติดตาม",
    hint: "ระยะพยากรณ์ไกลอาจเปลี่ยนแปลงได้",
  };
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string }>;
}) {
  if (!isSupabaseConfigured) return <NotConfiguredState />;
  const { province: pParam } = await searchParams;
  const province = getProvince(pParam ?? "TH-30") ?? getProvince("TH-30")!;

  let forecast, weather;
  try {
    [forecast, weather] = await Promise.all([
      getProvinceForecast(province.id),
      getLatestWeather(province.id),
    ]);
  } catch (err) {
    if (isNetworkRestrictedError(err)) return <NetworkRestrictedState />;
    return <ErrorState />;
  }

  const current = forecast.current ?? 0;
  const primary = forecast.daily[0] ?? null;
  const primaryClass = primary?.airQualityClass
    ? pm25ClassDefinition(primary.airQualityClass)
    : null;
  const next24 = forecast.hourly.slice(0, 24);
  const avg24 = next24.length ? next24.reduce((a, p) => a + p.pm25, 0) / next24.length : 0;
  const avgConfidence = forecast.daily.length
    ? forecast.daily.reduce((a, p) => a + p.confidence, 0) / forecast.daily.length
    : null;
  const directClassification = (
    !forecast.fallback.used
    && forecast.fallback.source === "active_classifier"
  );
  const primaryConfidence = confidenceStatus(
    primary?.classConfidence ?? primary?.confidence ?? null,
  );
  const averageConfidence = confidenceStatus(avgConfidence);
  const TrendIcon = forecast.trend === "up" ? TrendingUp : forecast.trend === "down" ? TrendingDown : Wind;
  const trendLabel = forecast.trend === "up" ? "แนวโน้มเพิ่มขึ้น" : forecast.trend === "down" ? "แนวโน้มลดลง" : "ทรงตัว";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">พยากรณ์ PM2.5</h1>
          <p className="muted text-sm">
            พยากรณ์ล่วงหน้า 7 วัน · อัปเดต <RelativeTime iso={forecast.generatedAt} />
          </p>
        </div>
        <ProvinceSelect value={province.id} />
      </div>

      {primary && primaryClass && (
        <Section
          title="ผลพยากรณ์หลัก"
          description={`${province.nameTh} · ${fmtDateTh(primary.t)} · ขอบฟ้าพยากรณ์ 1 วัน`}
        >
          <div className={`card border p-5 ${primaryClass.backgroundClass}`}>
            <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="muted text-xs">PM2.5 ที่พยากรณ์</p>
                <p className="mt-1 text-4xl font-bold tabular-nums">
                  {fmtPm25(primary.pm25)}
                  <span className="ml-2 text-base font-medium">µg/m³</span>
                </p>
                <p className={`mt-3 text-lg font-semibold ${primaryClass.textClass}`}>
                  ระดับ {primaryClass.labelTh}
                </p>
                <p className="text-sm">{primaryClass.labelEn}</p>
                <p className="muted mt-2 text-sm">{primaryClass.healthMessageTh}</p>
                <p className="mt-1 text-sm">{primaryClass.actionTh}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="muted text-xs">ความน่าเชื่อถือของผล</p>
                  <p className="mt-1 text-2xl font-semibold">{primaryConfidence.label}</p>
                  <p className="muted mt-1 text-xs">{primaryConfidence.hint}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="muted text-xs">การตรวจสอบผล</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-semibold">
                    {primary.classAgreement === true
                      ? <><CheckCircle2 size={17} className="text-emerald-500" /> ผลสอดคล้องกัน</>
                      : primary.classAgreement === false
                        ? <><AlertTriangle size={17} className="text-amber-500" /> ควรติดตามเพิ่มเติม</>
                        : <><CheckCircle2 size={17} className="text-sky-500" /> ตรวจตามเกณฑ์ PM2.5</>}
                  </p>
                  <p className="muted mt-1 text-xs">
                    {primary.classAgreement === false
                      ? "ระบบเลือกผลที่เหมาะสมสำหรับการแสดงผล"
                      : "พร้อมใช้ประกอบการวางแผนประจำวัน"}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="muted text-xs">วิธีจัดระดับคุณภาพอากาศ</p>
                  <p className="mt-1 font-semibold">
                    {directClassification
                      ? "ใช้โมเดลจัดระดับโดยตรง"
                      : "คำนวณจากค่าพยากรณ์ PM2.5"}
                  </p>
                  <p className="muted mt-1 text-xs">
                    {directClassification
                      ? "ตัวจัดระดับผ่านการตรวจสอบและเปิดใช้งานแล้ว"
                      : "แปลงค่า PM2.5 เป็นระดับคุณภาพอากาศตามเกณฑ์ของระบบ"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* PM2.5 / AQI forecast KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="ค่าปัจจุบัน" value={fmtPm25(current)} unit="µg/m³" icon={<Gauge size={16} />} accent={bandForPm25(current).color} hint={`AQI ${pm25ToAqi(current)}`} />
        <KpiCard label="คาดการณ์ 24 ชม." value={fmtPm25(avg24)} unit="µg/m³" icon={<CalendarClock size={16} />} accent={bandForPm25(avg24).color} hint={`AQI ${pm25ToAqi(avg24)} (เฉลี่ย)`} />
        <KpiCard label="ทิศทางแนวโน้ม" value={trendLabel} icon={<TrendIcon size={16} />} hint="เทียบ 7 วันข้างหน้า" />
        <KpiCard label="ความน่าเชื่อถือ" value={averageConfidence.label} icon={<Target size={16} />} hint={averageConfidence.hint} />
      </div>

      {/* Current weather context */}
      {weather && (
        <Section title="สภาพอากาศปัจจุบัน" description={`${province.nameTh} · ข้อมูลล่าสุดจาก Supabase`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="อุณหภูมิ"
              value={weather.temperature != null ? fmtNumber(weather.temperature, 1) : "–"}
              unit="°C"
              icon={<Thermometer size={16} />}
            />
            <KpiCard
              label="ความชื้นสัมพัทธ์"
              value={weather.humidity != null ? fmtNumber(weather.humidity, 0) : "–"}
              unit="%"
              icon={<Droplets size={16} />}
            />
            <KpiCard
              label="ความเร็วลม"
              value={weather.wind_speed != null ? fmtNumber(weather.wind_speed, 1) : "–"}
              unit="m/s"
              icon={<Wind size={16} />}
              hint={weather.wind_direction != null ? `ทิศ ${Math.round(weather.wind_direction)}°` : undefined}
            />
            <KpiCard
              label="ปริมาณฝน"
              value={weather.precipitation != null ? fmtNumber(weather.precipitation, 1) : "–"}
              unit="mm"
              icon={<Droplets size={16} />}
              hint="สะสม 1 ชม."
            />
          </div>
        </Section>
      )}

      <ForecastCard hourly={forecast.hourly} daily={forecast.daily} />

      <Section
        title="สถานะการทำงาน"
        description="สรุปวิธีที่ระบบใช้สร้างค่าพยากรณ์และระดับคุณภาพอากาศ"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="card card-pad">
            <p className="inline-flex items-center gap-2 font-semibold">
              <Gauge size={16} /> การพยากรณ์ PM2.5
            </p>
            <p className={`mt-3 text-lg font-semibold ${
              forecast.models.regression.eligible ? "text-emerald-600" : "text-sky-600"
            }`}>
              {forecast.models.regression.eligible ? "พร้อมใช้งาน" : "ใช้วิธีสำรอง"}
            </p>
            <p className="muted mt-1 text-xs">
              {forecast.models.regression.eligible
                ? "โมเดลหลักผ่านการตรวจสอบและเปิดใช้งานแล้ว"
                : "ระบบยังสร้างพยากรณ์จากข้อมูลล่าสุดได้"}
            </p>
          </div>
          <div className="card card-pad">
            <p className="inline-flex items-center gap-2 font-semibold">
              <BrainCircuit size={16} /> การจัดระดับคุณภาพอากาศ
            </p>
            <p className={`mt-3 text-lg font-semibold ${
              directClassification ? "text-emerald-600" : "text-sky-600"
            }`}>
              {directClassification ? "โมเดลพร้อมใช้งาน" : "คำนวณจากค่า PM2.5"}
            </p>
            <p className="muted mt-1 text-xs">
              {directClassification
                ? "ใช้ตัวจัดระดับที่ผ่านการตรวจสอบ"
                : "ยังแสดงระดับและคำแนะนำสุขภาพได้ตามปกติ"}
            </p>
          </div>
          <div className="card card-pad">
            <p className="inline-flex items-center gap-2 font-semibold">
              <CalendarClock size={16} /> การอัปเดตผล
            </p>
            <p className="mt-3 text-lg font-semibold text-emerald-600">มีข้อมูลพยากรณ์</p>
            <p className="muted mt-1 text-xs">
              อัปเดต <RelativeTime iso={forecast.generatedAt} />
            </p>
          </div>
        </div>
      </Section>

      <Section title="พยากรณ์รายวัน 7 วัน" description="ค่าเฉลี่ย ค่าสูงสุด และระดับคุณภาพอากาศ">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b border-border text-left text-xs">
                <th className="px-4 py-2.5 font-medium">วันที่</th>
                <th className="px-4 py-2.5 text-right font-medium">PM2.5 เฉลี่ย</th>
                <th className="px-4 py-2.5 text-right font-medium">AQI</th>
                <th className="px-4 py-2.5 text-right font-medium">สูงสุด</th>
                <th className="px-4 py-2.5 text-center font-medium">ระดับ</th>
                <th className="px-4 py-2.5 text-right font-medium">ความน่าเชื่อถือ</th>
              </tr>
            </thead>
            <tbody>
              {forecast.daily.map((d) => {
                const band = bandForPm25(d.pm25);
                return (
                  <tr key={d.t} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5">{fmtDateTh(d.t)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtPm25(d.pm25)}</td>
                    <td className="muted px-4 py-2.5 text-right tabular-nums">{pm25ToAqi(d.pm25)}</td>
                    <td className="muted px-4 py-2.5 text-right tabular-nums">{fmtPm25(d.pm25Max ?? null)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: band.color }}>
                        {band.labelTh}
                      </span>
                    </td>
                    <td className="muted px-4 py-2.5 text-right">
                      {confidenceStatus(d.confidence).label}
                    </td>
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
