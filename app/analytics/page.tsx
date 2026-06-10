"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import { HistoricalChart } from "@/components/charts/historical-chart";
import { RegionHeatmap } from "@/components/charts/region-heatmap";
import { riskBg, riskLabel, pm25Color } from "@/lib/colors";
import type { HistoricalPoint } from "@/types/air";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const METRICS = [
  { key: "pm25" as const, label: "PM2.5 (μg/m³)" },
  { key: "pm10" as const, label: "PM10 (μg/m³)" },
  { key: "aqi" as const, label: "AQI" },
  { key: "temp" as const, label: "อุณหภูมิ (°C)" },
  { key: "humidity" as const, label: "ความชื้น (%)" },
  { key: "wind" as const, label: "ความเร็วลม (m/s)" },
];

export default function AnalyticsPage() {
  const { data } = useThailandSnapshot();
  const rows = data?.data ?? [];

  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("chiang-mai");
  const [metric, setMetric] = useState<"pm25" | "pm10" | "aqi" | "temp" | "humidity" | "wind">("pm25");
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    setLoadingHistory(true);
    fetch(`/api/history?slug=${selectedSlug}&days=7`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .finally(() => setLoadingHistory(false));
  }, [selectedSlug]);

  // Analytics computations
  const analytics = useMemo(() => {
    if (!history.length) return null;
    const vals = history.map((h) => h.pm25);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const trend = vals.length >= 2 ? (vals.at(-1)! - vals[0]) / (vals.length - 1) : 0;

    // Correlation PM2.5 vs wind
    const pm = history.map((h) => h.pm25);
    const wind = history.map((h) => h.wind);
    const pmMean = pm.reduce((a, b) => a + b, 0) / pm.length;
    const windMean = wind.reduce((a, b) => a + b, 0) / wind.length;
    const num = pm.reduce((s, p, i) => s + (p - pmMean) * (wind[i] - windMean), 0);
    const den = Math.sqrt(pm.reduce((s, p) => s + (p - pmMean) ** 2, 0) * wind.reduce((s, w) => s + (w - windMean) ** 2, 0));
    const corrWindPm = den === 0 ? 0 : num / den;

    return { avg, max, min, trend, corrWindPm };
  }, [history]);

  // Region stats for heatmap
  const regionData = useMemo(() => {
    if (!rows.length) return [];
    const byRegion: Record<string, number[]> = {};
    for (const r of rows) {
      if (!byRegion[r.region]) byRegion[r.region] = [];
      byRegion[r.region].push(r.air.pm25);
    }
    return Object.entries(byRegion).map(([region, vals]) => ({
      region,
      avg_pm25: vals.reduce((a, b) => a + b, 0) / vals.length,
      max_pm25: Math.max(...vals),
      province_count: vals.length,
    }));
  }, [rows]);

  // National daily average trend
  const nationalTrend = useMemo(() => {
    if (!history.length) return [];
    return history.map((h) => ({
      date: h.date.slice(5),
      pm25: h.pm25,
      pm10: h.pm10,
      hotspots: h.hotspots,
    }));
  }, [history]);

  // Province ranking
  const ranked = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25), [rows]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">ศูนย์วิเคราะห์คุณภาพอากาศ</h1>
        <p className="mt-1 text-sm text-slate-500">ข้อมูลย้อนหลัง 7 วัน · แนวโน้ม · สหสัมพันธ์</p>
      </div>

      {/* Province selector */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">จังหวัด:</label>
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {rows.map((p) => (
            <option key={p.slug} value={p.slug}>{p.province_name_th}</option>
          ))}
          {!rows.length && <option value="chiang-mai">เชียงใหม่</option>}
        </select>
        <label className="text-sm font-medium">ตัวชี้วัด:</label>
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${metric === m.key ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      {analytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "PM2.5 เฉลี่ย 7 วัน", value: analytics.avg.toFixed(1), suffix: " μg/m³", color: pm25Color(analytics.avg) },
            { label: "PM2.5 สูงสุด", value: analytics.max.toFixed(1), suffix: " μg/m³", color: pm25Color(analytics.max) },
            { label: "PM2.5 ต่ำสุด", value: analytics.min.toFixed(1), suffix: " μg/m³", color: pm25Color(analytics.min) },
            {
              label: "แนวโน้ม (เฉลี่ยต่อวัน)",
              value: (analytics.trend >= 0 ? "+" : "") + analytics.trend.toFixed(1),
              suffix: " μg/m³/วัน",
              color: analytics.trend > 0 ? "#ef4444" : "#16a34a"
            },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70"
            >
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-xl font-bold" style={{ color: item.color }}>{item.value}<span className="text-sm font-normal text-slate-500">{item.suffix}</span></p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Historical chart */}
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
        <h2 className="mb-3 text-base font-semibold">กราฟย้อนหลัง 7 วัน</h2>
        {loadingHistory ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ) : (
          <HistoricalChart history={history} metric={metric} />
        )}
      </div>

      {/* PM2.5 vs Hotspot comparison */}
      {nationalTrend.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="mb-3 text-base font-semibold">PM2.5 vs จุดความร้อน (7 วัน)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={nationalTrend} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="pm25" name="PM2.5 (μg/m³)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="hotspots" name="จุดความร้อน" stroke="#f97316" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          {analytics && (
            <p className="mt-2 text-xs text-slate-500">
              สหสัมพันธ์ PM2.5 กับความเร็วลม: <b>{analytics.corrWindPm.toFixed(3)}</b>
              {Math.abs(analytics.corrWindPm) > 0.5 ? " (สัมพันธ์กันสูง)" : " (สัมพันธ์กันต่ำ)"}
            </p>
          )}
        </div>
      )}

      {/* Region heatmap */}
      {regionData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="mb-3 text-base font-semibold">PM2.5 เฉลี่ยรายภาค</h2>
          <RegionHeatmap data={regionData} />
        </div>
      )}

      {/* Province ranking table */}
      {ranked.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="mb-3 text-base font-semibold">อันดับจังหวัดตาม PM2.5 (ปัจจุบัน)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">จังหวัด</th>
                  <th className="py-2 pr-3">PM2.5</th>
                  <th className="py-2 pr-3">PM10</th>
                  <th className="py-2 pr-3">AQI</th>
                  <th className="py-2 pr-3">อุณหภูมิ</th>
                  <th className="py-2 pr-3">ลม</th>
                  <th className="py-2">ระดับ</th>
                </tr>
              </thead>
              <tbody>
                {ranked.slice(0, 20).map((p, i) => (
                  <tr key={p.slug} className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-1.5 pr-3 font-medium text-slate-400">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <a href={`/province/${p.slug}`} className="font-medium hover:underline">{p.province_name_th}</a>
                      <span className="ml-1 text-[10px] text-slate-400">{p.region}</span>
                    </td>
                    <td className="py-1.5 pr-3 font-bold" style={{ color: pm25Color(p.air.pm25) }}>{p.air.pm25.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-orange-600">{p.air.pm10.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-purple-600">{p.air.aqi}</td>
                    <td className="py-1.5 pr-3 text-cyan-600">{p.weather.temp.toFixed(1)}°</td>
                    <td className="py-1.5 pr-3 text-teal-600">{p.weather.wind.toFixed(1)}</td>
                    <td className="py-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${riskBg(p.air.pm25)}`}>{riskLabel(p.air.pm25)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
