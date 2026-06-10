"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { AqiGauge } from "@/components/ui/aqi-gauge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { HistoricalChart } from "@/components/charts/historical-chart";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import { THAILAND_PROVINCE_MAP } from "@/lib/provinces";
import { pm25Color, riskBg, riskLabel } from "@/lib/colors";
import type { ProvinceSnapshot } from "@/types/air";
import type { ForecastDay } from "@/lib/ml-engine";
import type { HistoricalPoint } from "@/types/air";

export function ProvinceDetailClient({ slug }: { slug: string }) {
  const { data, isLoading, error } = useThailandSnapshot();
  const rows: ProvinceSnapshot[] = data?.data ?? [];
  const province = rows.find((r) => r.slug === slug);
  const provinceMeta = THAILAND_PROVINCE_MAP[slug];

  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [forecastModel, setForecastModel] = useState("");
  const [loadingExtra, setLoadingExtra] = useState(true);
  const [metric, setMetric] = useState<"pm25" | "pm10" | "aqi" | "temp" | "humidity" | "wind">("pm25");

  useEffect(() => {
    setLoadingExtra(true);
    Promise.all([
      fetch(`/api/history?slug=${slug}&days=7`).then((r) => r.json()),
      fetch(`/api/forecast?slug=${slug}`).then((r) => r.json()),
    ])
      .then(([hist, fc]) => {
        setHistory(hist.history ?? []);
        setForecast(fc.forecast ?? []);
        setForecastModel(fc.model_used ?? "Ensemble");
      })
      .finally(() => setLoadingExtra(false));
  }, [slug]);

  const trend = useMemo(() => {
    if (!province) return 0;
    return forecast[0]?.predicted_pm25 ? forecast[0].predicted_pm25 - province.air.pm25 : 0;
  }, [province, forecast]);

  const histAnalytics = useMemo(() => {
    if (!history.length) return null;
    const vals = history.map((h) => h.pm25);
    return {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      max: Math.max(...vals),
      min: Math.min(...vals),
    };
  }, [history]);

  if (isLoading && !province) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      </div>
    );
  }

  if (error) return <p className="text-rose-600">โหลดข้อมูลไม่สำเร็จ: {error}</p>;

  const displayProvince = province ?? {
    slug,
    province_name_th: provinceMeta?.province_name_th ?? slug,
    province_name_en: provinceMeta?.province_name_en ?? slug,
    region: provinceMeta?.region ?? "Unknown",
    latitude: provinceMeta?.latitude ?? 13,
    longitude: provinceMeta?.longitude ?? 100,
    risk_level: "Good" as const,
    hotspot_count: 0,
    air: { pm25: 0, pm10: 0, aqi: 0, source: "fallback" as const, station: "-", fetchedAt: "-" },
    weather: { temp: 30, humidity: 60, wind: 3, rain: 0, source: "open-meteo-weather" as const },
    predicted_pm25: 0,
    prediction_model: "moving-average" as const,
    insight: "",
    nearby_stations: [],
  };

  const pm25 = displayProvince.air.pm25;

  return (
    <section className="space-y-5">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-6 shadow-sm dark:border-slate-700 dark:from-sky-950/30 dark:via-slate-900 dark:to-indigo-950/20"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/" className="text-xs text-slate-500 hover:underline">หน้าหลัก</Link>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-xs text-slate-500">{displayProvince.region}</span>
            </div>
            <h1 className="mt-1 text-3xl font-extrabold">{displayProvince.province_name_th}</h1>
            <p className="text-sm text-slate-500">{displayProvince.province_name_en} · {displayProvince.region}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pm25 > 0 && <RiskBadge pm25={pm25} />}
              {displayProvince.hotspot_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                  🔥 {displayProvince.hotspot_count} จุดความร้อน
                </span>
              )}
              {trend !== 0 && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${trend > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                  {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)} μg/m³ (พรุ่งนี้)
                </span>
              )}
            </div>
          </div>
          {pm25 > 0 && <AqiGauge pm25={pm25} size={140} />}
        </div>
      </motion.div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "PM2.5", value: pm25.toFixed(1), unit: "μg/m³", color: pm25Color(pm25) },
          { label: "PM10", value: displayProvince.air.pm10.toFixed(1), unit: "μg/m³", color: "#f97316" },
          { label: "AQI", value: displayProvince.air.aqi.toString(), unit: "", color: "#8b5cf6" },
          { label: "อุณหภูมิ", value: displayProvince.weather.temp.toFixed(1), unit: "°C", color: "#06b6d4" },
          { label: "ความชื้น", value: displayProvince.weather.humidity.toString(), unit: "%", color: "#3b82f6" },
          { label: "ลม", value: displayProvince.weather.wind.toFixed(1), unit: "m/s", color: "#10b981" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-center dark:border-slate-700 dark:bg-slate-900/70"
          >
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-1 text-xl font-extrabold" style={{ color: item.color }}>{item.value}</p>
            <p className="text-[10px] text-slate-400">{item.unit}</p>
          </motion.div>
        ))}
      </div>

      {/* Historical analytics */}
      {histAnalytics && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "PM2.5 เฉลี่ย 7 วัน", value: histAnalytics.avg.toFixed(1), unit: "μg/m³" },
            { label: "สูงสุด 7 วัน", value: histAnalytics.max.toFixed(1), unit: "μg/m³" },
            { label: "ต่ำสุด 7 วัน", value: histAnalytics.min.toFixed(1), unit: "μg/m³" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200">{item.value} <span className="text-xs font-normal text-slate-400">{item.unit}</span></p>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">ข้อมูลย้อนหลัง 7 วัน</h2>
          <div className="ml-auto flex flex-wrap gap-1">
            {(["pm25", "pm10", "aqi", "temp", "humidity", "wind"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${metric === m ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {loadingExtra ? (
          <div className="h-60 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ) : (
          <HistoricalChart history={history} metric={metric} />
        )}
      </div>

      {/* Forecast */}
      {forecast.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="mb-1 text-base font-semibold">พยากรณ์ PM2.5 ล่วงหน้า 7 วัน</h2>
          <p className="mb-3 text-xs text-slate-500">โมเดล: <b>{forecastModel}</b></p>
          <div className="mb-4 grid grid-cols-7 gap-1">
            {forecast.map((day, i) => {
              const d = new Date(day.date);
              return (
                <div key={day.date} className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-1.5 text-center dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-[9px] text-slate-400">{d.toLocaleDateString("th-TH", { weekday: "short" })}</p>
                  <div className="my-1 h-1 w-full rounded-full" style={{ backgroundColor: pm25Color(day.predicted_pm25) }} />
                  <p className="text-xs font-bold" style={{ color: pm25Color(day.predicted_pm25) }}>{day.predicted_pm25.toFixed(0)}</p>
                  <p className="text-[8px] text-slate-400">μg/m³</p>
                </div>
              );
            })}
          </div>
          <ForecastChart
            history={history.map((h) => ({ date: h.date, pm25: h.pm25 }))}
            forecast={forecast}
          />
        </div>
      )}

      {/* Insight & health advice */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">AI Insight</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{displayProvince.insight || "กำลังวิเคราะห์ข้อมูล..."}</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">คำแนะนำสุขภาพ</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {pm25 > 150.4 ? "⛔ ห้ามออกนอกบ้าน ปิดประตูหน้าต่างทุกบาน ใช้เครื่องกรองอากาศ"
              : pm25 > 55.4 ? "⚠️ งดกิจกรรมกลางแจ้ง สวมหน้ากาก N95 ตลอดเวลา"
              : pm25 > 35.4 ? "😷 กลุ่มเสี่ยงควรสวมหน้ากาก จำกัดเวลาอยู่กลางแจ้ง"
              : "✅ คุณภาพอากาศดี สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ"}
          </p>
        </Card>
      </div>

      {/* Weather details */}
      <Card>
        <h2 className="mb-3 font-semibold">สภาพอากาศปัจจุบัน</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { icon: "🌡️", label: "อุณหภูมิ", value: `${displayProvince.weather.temp.toFixed(1)}°C` },
            { icon: "💧", label: "ความชื้น", value: `${displayProvince.weather.humidity}%` },
            { icon: "💨", label: "ความเร็วลม", value: `${displayProvince.weather.wind.toFixed(1)} m/s` },
            { icon: "🌧️", label: "ฝน", value: `${displayProvince.weather.rain.toFixed(1)} mm` },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
              <span className="text-2xl">{item.icon}</span>
              <p className="mt-1 text-sm font-bold">{item.value}</p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/forecast" className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-700">📈 ดูพยากรณ์เต็ม</Link>
        <Link href="/compare" className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">⚖️ เปรียบเทียบ</Link>
        <Link href="/analytics" className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">📊 วิเคราะห์</Link>
      </div>

      <p className="text-[10px] text-slate-400">สถานีวัด: {displayProvince.nearby_stations?.join(", ") || "-"} · ดึงข้อมูล: {displayProvince.air.fetchedAt ? new Date(displayProvince.air.fetchedAt).toLocaleString("th-TH") : "-"}</p>
    </section>
  );
}
