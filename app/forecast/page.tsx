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
import { getModelDisplayName } from "@/lib/model-labels";
import { PM25_CLASSES, pm25ClassDefinition } from "@/lib/pm25-classification";

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
    : 0;
  const TrendIcon = forecast.trend === "up" ? TrendingUp : forecast.trend === "down" ? TrendingDown : Wind;
  const trendLabel = forecast.trend === "up" ? "แนวโน้มเพิ่มขึ้น" : forecast.trend === "down" ? "แนวโน้มลดลง" : "ทรงตัว";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">พยากรณ์ PM2.5</h1>
          <p className="muted text-sm">
            ขอบฟ้าพยากรณ์ 168 ชั่วโมง · โมเดล {getModelDisplayName(forecast.model)}
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
                  <p className="muted text-xs">ความมั่นใจของ Classifier</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {primary.classConfidence != null
                      ? `${Math.round(primary.classConfidence * 100)}%`
                      : "ไม่มี Classifier"}
                  </p>
                  <p className="muted mt-1 text-xs">
                    ไม่ใช่ความน่าจะเป็นที่ค่า PM2.5 จะตรงแบบจุด
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="muted text-xs">ความสอดคล้องของสองโมเดล</p>
                  <p className="mt-2 inline-flex items-center gap-2 font-semibold">
                    {primary.classAgreement === true
                      ? <><CheckCircle2 size={17} className="text-emerald-500" /> ตรงกัน</>
                      : primary.classAgreement === false
                        ? <><AlertTriangle size={17} className="text-amber-500" /> ไม่ตรงกัน</>
                        : "ใช้ Regression fallback"}
                  </p>
                  <p className="muted mt-1 text-xs">
                    Classifier {primary.classifierPredictedClass ?? "–"} · Regression {primary.regressionDerivedClass ?? "–"}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-border/70 bg-background/70 p-3">
                  <p className="muted text-xs">แหล่งผลการจัดระดับ</p>
                  <p className="mt-1 font-semibold">
                    {primary.classificationSource === "active_classifier"
                      ? "Direct Classification Model"
                      : "Regression Threshold Fallback"}
                  </p>
                  {primary.fallbackUsed && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      ใช้ fallback: {primary.fallbackReason ?? "ไม่มี classifier ที่ผ่านเกณฑ์"}
                    </p>
                  )}
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
        <KpiCard label="ระดับความเชื่อมั่น" value={`${Math.round(avgConfidence * 100)}`} unit="%" icon={<Target size={16} />} hint="เฉลี่ยตลอดช่วงพยากรณ์" />
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

      {primary?.probabilities && (
        <Section
          title="ความน่าจะเป็นของระดับคุณภาพอากาศ"
          description="ผลจาก Classification Model; ผลรวมของทั้ง 5 ระดับเท่ากับ 100%"
        >
          <div className="card card-pad space-y-3">
            {PM25_CLASSES.map((item) => {
              const probability = primary.probabilities?.[item.id] ?? 0;
              return (
                <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">Class {item.id} · {item.labelTh}</span>
                      <span className="muted hidden text-xs sm:inline">{item.labelEn}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${Math.max(0, Math.min(100, probability * 100))}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {(probability * 100).toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section
        title="โมเดลและผลประเมิน"
        description="Regression และ Classification ถูกเลือกและประเมินแยกกันในแต่ละจังหวัด"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="card card-pad">
            <p className="inline-flex items-center gap-2 font-semibold">
              <Gauge size={16} /> Regression
            </p>
            <p className="mt-1 font-mono text-sm">{forecast.models.regression.name}</p>
            <p className="muted text-xs">
              Run {forecast.models.regression.runId?.slice(0, 8) ?? "legacy"} ·
              {forecast.models.regression.eligible ? " ผ่านเกณฑ์" : " fallback/legacy"}
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
              {(["mae", "rmse", "r2", "skill_vs_persistence"] as const).map((key) => {
                const value = Number(forecast.models.regression.metrics?.[key]);
                const label = key === "skill_vs_persistence" ? "Skill" : key.toUpperCase();
                return (
                  <div key={key} className="rounded-lg bg-foreground/5 p-2">
                    <p className="muted">{label}</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {Number.isFinite(value) ? value.toFixed(3) : "–"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card card-pad">
            <p className="inline-flex items-center gap-2 font-semibold">
              <BrainCircuit size={16} /> Classification
            </p>
            <p className="mt-1 font-mono text-sm">
              {forecast.models.classification?.name ?? "Regression threshold fallback"}
            </p>
            <p className="muted text-xs">
              Run {forecast.models.classification?.runId?.slice(0, 8) ?? "–"} ·
              {forecast.models.classification?.eligible ? " ผ่านเกณฑ์" : " ยังไม่มีโมเดลที่ผ่านเกณฑ์"}
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
              {(["accuracy", "macro_precision", "macro_recall", "macro_f1"] as const).map((key) => {
                const value = Number(forecast.models.classification?.metrics?.[key]);
                const labels = {
                  accuracy: "Accuracy",
                  macro_precision: "Macro P",
                  macro_recall: "Macro R",
                  macro_f1: "Macro F1",
                };
                return (
                  <div key={key} className="rounded-lg bg-foreground/5 p-2">
                    <p className="muted">{labels[key]}</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {Number.isFinite(value) ? value.toFixed(3) : "–"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title="พยากรณ์รายวัน 7 วัน" description="ค่าเฉลี่ยและช่วงความเชื่อมั่น">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b border-border text-left text-xs">
                <th className="px-4 py-2.5 font-medium">วันที่</th>
                <th className="px-4 py-2.5 text-right font-medium">PM2.5 เฉลี่ย</th>
                <th className="px-4 py-2.5 text-right font-medium">AQI</th>
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
                    <td className="muted px-4 py-2.5 text-right tabular-nums">{pm25ToAqi(d.pm25)}</td>
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
