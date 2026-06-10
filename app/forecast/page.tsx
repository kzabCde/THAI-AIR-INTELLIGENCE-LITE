"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { THAILAND_PROVINCES } from "@/lib/thailand-provinces";
import { riskBg, riskLabel, pm25Color, AQI_BANDS } from "@/lib/colors";
import { ForecastChart } from "@/components/charts/forecast-chart";
import type { ForecastDay } from "@/lib/ml-engine";
import type { HistoricalPoint } from "@/types/air";

interface ForecastPayload {
  slug: string;
  province_name_th: string;
  province_name_en: string;
  model_used: string;
  forecast: ForecastDay[];
  metrics?: { model: string; rmse: number; mae: number; r2: number }[];
}

interface AllForecastPayload {
  generated_at: string;
  days: number;
  provinces: {
    slug: string;
    province_name_th: string;
    province_name_en: string;
    region: string;
    forecast: ForecastDay[];
  }[];
}

const REGIONS = ["All", "North", "Northeast", "Central", "East", "West", "South"];
const REGION_TH: Record<string, string> = {
  All: "ทั้งหมด", North: "ภาคเหนือ", Northeast: "ภาคอีสาน",
  Central: "ภาคกลาง", East: "ภาคตะวันออก", West: "ภาคตะวันตก", South: "ภาคใต้",
};

export default function ForecastPage() {
  const [allForecast, setAllForecast] = useState<AllForecastPayload | null>(null);
  const [selected, setSelected] = useState<string>("chiang-mai");
  const [detail, setDetail] = useState<ForecastPayload | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [regionFilter, setRegionFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"pm25" | "name">("pm25");
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => r.json())
      .then((d) => { setAllForecast(d); setLoadingAll(false); })
      .catch(() => setLoadingAll(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingDetail(true);
    Promise.all([
      fetch(`/api/forecast?slug=${selected}`).then((r) => r.json()),
      fetch(`/api/history?slug=${selected}&days=7`).then((r) => r.json()),
    ])
      .then(([fc, hist]) => {
        setDetail(fc);
        setHistory(hist.history ?? []);
      })
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  const filteredProvinces = useMemo(() => {
    if (!allForecast) return [];
    let list = allForecast.provinces;
    if (regionFilter !== "All") {
      list = list.filter((p) => p.region === regionFilter);
    }
    if (sortBy === "pm25") {
      list = [...list].sort((a, b) => (b.forecast[0]?.predicted_pm25 ?? 0) - (a.forecast[0]?.predicted_pm25 ?? 0));
    } else {
      list = [...list].sort((a, b) => a.province_name_th.localeCompare(b.province_name_th, "th"));
    }
    return list;
  }, [allForecast, regionFilter, sortBy]);

  const forecastDays = detail?.forecast ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">พยากรณ์คุณภาพอากาศล่วงหน้า 7 วัน</h1>
        <p className="mt-1 text-sm text-slate-500">ML Ensemble Model · ครอบคลุม 77 จังหวัด · อัปเดตทุกวัน</p>
      </div>

      {/* AQI legend */}
      <div className="flex flex-wrap gap-2">
        {AQI_BANDS.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: b.color, color: b.textColor }}>
            {b.label}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Province list */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegionFilter(r)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${regionFilter === r ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                {REGION_TH[r]}
              </button>
            ))}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setSortBy("pm25")} className={`rounded px-2 py-1 ${sortBy === "pm25" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"}`}>เรียงตาม PM2.5</button>
            <button onClick={() => setSortBy("name")} className={`rounded px-2 py-1 ${sortBy === "name" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"}`}>เรียงตามชื่อ</button>
          </div>

          {loadingAll ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-280px)] space-y-1.5 overflow-y-auto pr-1">
              {filteredProvinces.map((p) => {
                const pm = p.forecast[0]?.predicted_pm25 ?? 0;
                return (
                  <button
                    key={p.slug}
                    onClick={() => setSelected(p.slug)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selected === p.slug
                        ? "border-sky-500 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/30"
                        : "border-slate-200 bg-white/80 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.province_name_th}</span>
                      <span className="text-xs font-bold" style={{ color: pm25Color(pm) }}>{pm.toFixed(1)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{p.region}</span>
                      <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${riskBg(pm)}`}>{riskLabel(pm)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Forecast detail */}
        <div className="space-y-4">
          {loadingDetail ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ) : detail ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">{detail.province_name_th}</h2>
                  <p className="text-sm text-slate-500">โมเดลที่ใช้: <b>{detail.model_used}</b></p>
                </div>
                <a href={`/province/${selected}`} className="rounded-xl border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">ดูรายละเอียด →</a>
              </div>

              {/* 7-day forecast cards */}
              <div className="grid grid-cols-7 gap-1.5">
                {forecastDays.map((day, i) => {
                  const d = new Date(day.date);
                  return (
                    <motion.div
                      key={day.date}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex flex-col items-center rounded-xl border border-slate-200 bg-white/80 p-2 text-center dark:border-slate-700 dark:bg-slate-900/70"
                    >
                      <p className="text-[10px] font-medium text-slate-500">
                        {d.toLocaleDateString("th-TH", { weekday: "short" })}
                      </p>
                      <p className="text-[10px] text-slate-400">{d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</p>
                      <div className="my-1.5 h-1 w-full rounded-full" style={{ backgroundColor: pm25Color(day.predicted_pm25) }} />
                      <p className="text-sm font-bold" style={{ color: pm25Color(day.predicted_pm25) }}>{day.predicted_pm25.toFixed(0)}</p>
                      <p className="text-[9px] text-slate-400">μg/m³</p>
                      <p className="mt-1 text-[9px] font-semibold leading-tight text-slate-600 dark:text-slate-400">AQI {day.predicted_aqi}</p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Forecast chart */}
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <h3 className="mb-3 text-sm font-semibold">กราฟพยากรณ์ PM2.5 (ย้อนหลัง 7 วัน + พยากรณ์ 7 วัน)</h3>
                <ForecastChart
                  history={history.map((h) => ({ date: h.date, pm25: h.pm25 }))}
                  forecast={forecastDays}
                />
              </div>

              {/* Risk summary */}
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                <h3 className="mb-3 text-sm font-semibold">สรุปความเสี่ยง 7 วันข้างหน้า</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: "PM2.5 เฉลี่ย", value: (forecastDays.reduce((s, d) => s + d.predicted_pm25, 0) / forecastDays.length).toFixed(1), suffix: " μg/m³" },
                    { label: "PM2.5 สูงสุด", value: Math.max(...forecastDays.map((d) => d.predicted_pm25)).toFixed(1), suffix: " μg/m³" },
                    { label: "PM2.5 ต่ำสุด", value: Math.min(...forecastDays.map((d) => d.predicted_pm25)).toFixed(1), suffix: " μg/m³" },
                    { label: "AQI สูงสุด", value: Math.max(...forecastDays.map((d) => d.predicted_aqi)).toString(), suffix: "" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-200">{item.value}{item.suffix}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-1.5">
                  {forecastDays.map((day) => (
                    <div key={day.date} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">{new Date(day.date).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short" })}</span>
                      <div className="flex items-center gap-2">
                        <span style={{ color: pm25Color(day.predicted_pm25) }} className="font-semibold">{day.predicted_pm25.toFixed(1)} μg/m³</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskBg(day.predicted_pm25)}`}>{riskLabel(day.predicted_pm25)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model metrics */}
              {detail.metrics && detail.metrics.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                  <h3 className="mb-3 text-sm font-semibold">เปรียบเทียบโมเดล</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="py-1.5 pr-4">โมเดล</th>
                          <th className="py-1.5 pr-4">MAE</th>
                          <th className="py-1.5 pr-4">RMSE</th>
                          <th className="py-1.5">R²</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.metrics.map((m) => (
                          <tr key={m.model} className={`border-b last:border-0 ${m.model === detail.model_used ? "bg-sky-50 font-semibold dark:bg-sky-900/20" : ""}`}>
                            <td className="py-1.5 pr-4">{m.model} {m.model === detail.model_used && "★"}</td>
                            <td className="py-1.5 pr-4">{m.mae.toFixed(2)}</td>
                            <td className="py-1.5 pr-4">{m.rmse.toFixed(2)}</td>
                            <td className="py-1.5">{m.r2.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-400">
              เลือกจังหวัดเพื่อดูพยากรณ์
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
