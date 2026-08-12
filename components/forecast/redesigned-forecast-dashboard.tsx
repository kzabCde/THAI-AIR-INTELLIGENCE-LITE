"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CloudRain,
  Flame,
  Leaf,
  RefreshCw,
  Sun,
  CloudSun,
  Wind,
  Droplets,
  ChevronRight,
  CheckCircle2,
  Minus,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus as FlatLine,
  HeartPulse,
  ShieldCheck,
  Baby,
  DoorOpen,
  PersonStanding,
  Moon,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { IsanProvince } from "@/lib/isan";
import { pm25ToAqi, bandForPm25, bandForAqi } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import type { ProvinceForecast, ForecastPoint } from "@/services/types";
import type { WeatherRow } from "@/services/weather.service";
import type { RegionOverview } from "@/services/types";

const THAI_FULL_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const THAI_SHORT_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

function formatThaiDayFull(d: Date, index: number): string {
  if (index === 0) return "วันนี้";
  if (index === 1) return "พรุ่งนี้";
  return THAI_FULL_DAYS[d.getDay()] ?? "-";
}

function formatThaiShortDate(d: Date): string {
  return `${d.getDate()} ${THAI_SHORT_MONTHS[d.getMonth()]}`;
}

function formatTimeString(d: Date): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
}

/** Find the contiguous block in hourly24 that has the lowest/highest mean PM2.5 over `windowHours` */
function findTimeWindow(
  hourly: ForecastPoint[],
  mode: "min" | "max",
  windowHours: number = 3,
): { startTime: string; endTime: string; minPm: number; maxPm: number } | null {
  if (!hourly.length) return null;
  let bestScore = mode === "min" ? Infinity : -Infinity;
  let bestIdx = 0;
  for (let i = 0; i <= hourly.length - windowHours; i++) {
    const slice = hourly.slice(i, i + windowHours);
    const avg = slice.reduce((s, p) => s + p.pm25, 0) / slice.length;
    if (mode === "min" ? avg < bestScore : avg > bestScore) {
      bestScore = avg;
      bestIdx = i;
    }
  }
  const slice = hourly.slice(bestIdx, bestIdx + windowHours);
  const startD = new Date(slice[0].t);
  const endD = new Date(slice[slice.length - 1].t);
  endD.setHours(endD.getHours() + 1);
  return {
    startTime: formatTimeString(startD),
    endTime: formatTimeString(endD),
    minPm: Math.round(Math.min(...slice.map((p) => p.pm25))),
    maxPm: Math.round(Math.max(...slice.map((p) => p.pm25))),
  };
}

interface RedesignedForecastDashboardProps {
  province: IsanProvince;
  forecast: ProvinceForecast;
  weather: WeatherRow | null;
  overview: RegionOverview;
}

export function RedesignedForecastDashboard({
  province,
  forecast,
  weather,
  overview,
}: RedesignedForecastDashboardProps) {
  const router = useRouter();
  const [horizon, setHorizon] = useState<"24h" | "3d" | "7d">("24h");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setLastRefreshedAt(new Date());
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // ── Real PM2.5 / AQI current value ──────────────────────────────────────────
  // Prefer `forecast.current` (latest observed reading), fall back to daily[0] mean
  const currentPm25 = forecast.current ?? forecast.daily[0]?.pm25 ?? 0;
  const currentAqi = pm25ToAqi(currentPm25);
  const currentBand = bandForAqi(currentAqi);

  // ── Hourly slice based on selected horizon ───────────────────────────────────
  const activeHourlySlice =
    horizon === "24h"
      ? forecast.hourly.slice(0, 24)
      : horizon === "3d"
      ? forecast.hourly.slice(0, 72)
      : forecast.hourly.slice(0, 168);

  const hourly24 = forecast.hourly.slice(0, 24);

  // ── Peak / Min from real hourly data ────────────────────────────────────────
  const peakHourItem = forecast.peak ??
    hourly24.reduce<ForecastPoint | null>(
      (max, p) => (!max || p.pm25 > max.pm25 ? p : max),
      null,
    );
  const minHourItem = hourly24.reduce<ForecastPoint | null>(
    (min, p) => (!min || p.pm25 < min.pm25 ? p : min),
    null,
  );

  // Real max/min values from data
  const maxPmVal = peakHourItem ? Math.round(peakHourItem.pm25) : null;
  const maxPmTime = peakHourItem ? formatTimeString(new Date(peakHourItem.t)) : null;
  const minPmVal = minHourItem ? Math.round(minHourItem.pm25) : null;
  const minPmTime = minHourItem ? formatTimeString(new Date(minHourItem.t)) : null;

  // ── Best & Risk time windows from real hourly data ───────────────────────────
  const bestWindow = findTimeWindow(hourly24, "min", 3);
  const riskWindow = findTimeWindow(hourly24, "max", 4);

  // ── Divide 24h into 4 quartile time segments from real data ─────────────────
  const q0 = hourly24.slice(0, 6);   // first 6h
  const q1 = hourly24.slice(6, 12);  // next 6h
  const q2 = hourly24.slice(12, 18); // next 6h
  const q3 = hourly24.slice(18, 24); // last 6h

  function segmentLabel(points: ForecastPoint[]): { startTime: string; endTime: string; minPm: number; maxPm: number } | null {
    if (!points.length) return null;
    const start = formatTimeString(new Date(points[0].t));
    const lastD = new Date(points[points.length - 1].t);
    lastD.setHours(lastD.getHours() + 1);
    const end = formatTimeString(lastD);
    return {
      startTime: start,
      endTime: end,
      minPm: Math.round(Math.min(...points.map((p) => p.pm25))),
      maxPm: Math.round(Math.max(...points.map((p) => p.pm25))),
    };
  }

  const seg0 = segmentLabel(q0);
  const seg1 = segmentLabel(q1);
  const seg2 = segmentLabel(q2);
  const seg3 = segmentLabel(q3);

  // ── AI Insight: derive from real weather data ────────────────────────────────
  const windSpeed = weather?.wind_speed ?? null;
  // Use 24h accumulated precipitation from overview snapshot instead of 1h
  const currentSnapshot = overview.snapshots.find((s) => s.province.id === province.id);
  const precipitation = currentSnapshot?.precipitation24h ?? null;
  const humidity = weather?.humidity ?? null;
  const totalHotspots = overview.totalHotspots;

  // Threshold-based insight labels from real data
  const windLabel = windSpeed == null ? null : windSpeed < 2 ? "ลมอ่อนมาก" : windSpeed < 4 ? "ลมอ่อน" : windSpeed < 8 ? "ลมปานกลาง" : "ลมแรง";
  const windDesc = windSpeed == null ? null : windSpeed < 2 ? "การระบายอากาศไม่ดี" : windSpeed < 4 ? "ระบายอากาศได้บ้าง" : "ระบายอากาศดี";
  const rainLabel = precipitation == null ? null : precipitation > 1 ? "มีฝน (24 ชม.)" : "ไม่มีฝน (24 ชม.)";
  const rainDesc = precipitation == null ? null : precipitation > 1 ? `ฝนช่วยชะล้างฝุ่น ${precipitation.toFixed(1)} mm` : "ไม่มีฝนชะล้างฝุ่นใน 24 ชม.";
  const humidLabel = humidity == null ? null : humidity > 75 ? "ความชื้นสูง" : humidity < 40 ? "ความชื้นต่ำ" : "ความชื้นปานกลาง";
  const humidDesc = humidity == null ? null : humidity > 75 ? "ฝุ่นจับตัวง่ายในอากาศ" : humidity < 40 ? "อากาศแห้ง ฝุ่นฟุ้งง่าย" : "ความชื้นอยู่ในเกณฑ์ปกติ";
  const hotspotLabel = `จุดความร้อน ${totalHotspots} จุด`;
  const hotspotDesc = totalHotspots > 50 ? "พบจุดความร้อนมากในภูมิภาค" : totalHotspots > 10 ? "พบจุดความร้อนในพื้นที่ใกล้เคียง" : "จุดความร้อนต่ำ";

  // ── Provinces sorted by PM2.5 delta (rising trend) from real data ────────────
  const risingProvinces = [...overview.snapshots]
    .filter((s) => s.pm25 != null)
    .sort((a, b) => (b.pm25Delta ?? 0) - (a.pm25Delta ?? 0))
    .slice(0, 5);

  // If no delta data available, sort by absolute PM2.5
  const topRisingProvinces = risingProvinces.length
    ? risingProvinces
    : [...overview.snapshots].sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0)).slice(0, 5);

  // ── Chart data ───────────────────────────────────────────────────────────────
  const chartData = activeHourlySlice.map((h, i) => {
    const d = new Date(h.t);
    const hourStr = formatTimeString(d);
    return {
      t: h.t,
      label: horizon === "24h" ? hourStr : `${d.getDate()}/${d.getMonth() + 1} ${hourStr}`,
      pm25: +h.pm25.toFixed(1),
      isCurrent: i === 0,
      band: bandForPm25(h.pm25),
    };
  });

  const confidenceVal = Math.round((forecast.daily[0]?.confidence ?? 0.82) * 100);
  const forecastGenTimeStr = formatTimeString(new Date(forecast.generatedAt));
  const refreshedTimeStr = formatTimeString(lastRefreshedAt);
  const currentLabelTime = activeHourlySlice[0]
    ? formatTimeString(new Date(activeHourlySlice[0].t))
    : forecastGenTimeStr;

  // ── Helper: render N/A when no data ─────────────────────────────────────────
  function pmRange(min: number | null, max: number | null) {
    if (min == null || max == null) return "ไม่มีข้อมูล";
    if (min === max) return `${min} µg/m³`;
    return `${min} – ${max} µg/m³`;
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-6">

          {/* ================================================================ */}
          {/* LEFT / MAIN COLUMN                                               */}
          {/* ================================================================ */}
          <div className="space-y-3.5 font-sans text-slate-800 dark:text-slate-100 lg:col-span-2">

            {/* 1. TOP NAV */}
            <div className="flex items-center gap-3">
              <h1 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                พยากรณ์ PM2.5 รายชั่วโมง
              </h1>
            </div>

            {/* 2. PROVINCE DROPDOWN + HORIZON TABS */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 max-w-xs flex-1">
                <ProvinceSelectModal
                  snapshots={overview.snapshots}
                  selectedId={province.id}
                  onSelect={(id) => router.push(`/forecast?province=${id}`)}
                />
              </div>
              <div className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                {(["24h", "3d", "7d"] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      horizon === h
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {h === "24h" ? "24 ชั่วโมง" : h === "3d" ? "3 วัน" : "7 วัน"}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. LIVE STATUS LINE — single line, horizontal scroll on narrow */}
            <div className="flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap rounded-xl border border-slate-100 bg-white px-3 py-2 text-[11px] font-semibold shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:text-xs sm:px-4 sm:py-2.5">
              <span className="shrink-0 text-slate-500 dark:text-slate-400">อัปเดต {refreshedTimeStr} น.</span>
              <span className="shrink-0 text-slate-300 dark:text-slate-700">|</span>
              <span className="shrink-0">
                PM2.5 <strong className="font-extrabold text-emerald-600">{fmtPm25(currentPm25)}</strong> µg/m³
              </span>
              <span className="shrink-0 text-slate-300 dark:text-slate-700">|</span>
              <span className="shrink-0">AQI <strong className="font-extrabold">{currentAqi}</strong></span>
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-2xs"
                style={{ backgroundColor: currentBand.color }}
              >
                {currentBand.labelTh}
              </span>
              <button onClick={handleRefresh} className="shrink-0 p-0.5 text-slate-400 hover:text-slate-700" title="รีเฟรช">
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
              </button>
            </div>

            {/* 4. CHART CARD */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                  พยากรณ์ PM2.5 รายชั่วโมง
                </h3>
                <div className="flex items-center gap-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-2.5 rounded bg-slate-800 dark:bg-slate-200" />
                    ค่าจริง
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-2.5 rounded border border-dashed border-blue-500" />
                    พยากรณ์ AI
                  </span>
                  <span className="font-mono text-slate-400">µg/m³</span>
                </div>
              </div>

              {/* Current-time speech bubble */}
              <div className="relative mt-2 flex justify-center">
                <div className="inline-flex flex-col items-center">
                  <span className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-2xs dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ตอนนี้ <span className="font-normal opacity-80">{currentLabelTime}</span>
                  </span>
                  <span className="h-1.5 w-1.5 -translate-y-1 rotate-45 border-b border-r border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" />
                </div>
              </div>

              {/* Chart */}
              <div className="mt-1 h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 15, right: 5, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                        <stop offset="50%" stopColor="#f97316" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 232 240 / 0.6)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "#64748b" }}
                      stroke="#cbd5e1"
                      interval={horizon === "24h" ? 2 : horizon === "3d" ? 8 : 16}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#64748b" }}
                      stroke="#cbd5e1"
                      domain={[0, (dataMax: number) => Math.max(50, Math.ceil(dataMax * 1.3))]}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          const band = d.band;
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white/95 p-2 text-[11px] shadow-md backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{d.label}</p>
                              <div className="mt-0.5 flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: band.color }} />
                                <span className="font-bold text-slate-900 dark:text-white">{d.pm25} µg/m³</span>
                              </div>
                              <p className="mt-0.5 text-[10px] font-medium" style={{ color: band.color }}>
                                ระดับ {band.labelTh}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      x={chartData[0]?.label}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="pm25"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#forecastGrad)"
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = payload.band?.color ?? "#ef4444";
                        return (
                          <circle
                            key={payload.t}
                            cx={cx}
                            cy={cy}
                            r={3.5}
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth={1}
                          />
                        );
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* 5-Color Category Bar Legend */}
              <div className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[9.5px]">
                {[
                  { color: "bg-emerald-500", label: "ดี", range: "0–25" },
                  { color: "bg-green-500", label: "ดี", range: "26–50" },
                  { color: "bg-amber-500", label: "ปานกลาง", range: "51–100" },
                  { color: "bg-orange-500", label: "เริ่มมีผลกระทบ", range: "101–150" },
                  { color: "bg-rose-600", label: "มีผลกระทบ", range: "151+" },
                ].map((item) => (
                  <div key={item.range}>
                    <div className={`h-1 rounded-full ${item.color}`} />
                    <p className="mt-1 font-medium text-slate-600 dark:text-slate-400 leading-tight">{item.label}</p>
                    <p className="text-[8.5px] text-slate-400">{item.range}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. PEAK / MIN TODAY — real data */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                ค่าสูงสุด/ต่ำสุดวันนี้ (PM2.5 พยากรณ์)
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 p-3 shadow-2xs dark:border-rose-950 dark:bg-rose-950/20">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
                    <ArrowUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-rose-700 dark:text-rose-400">ค่าสูงสุดคาดการณ์</p>
                    <p className="text-base font-extrabold text-rose-900 dark:text-rose-100">
                      {maxPmVal != null ? maxPmVal : "—"}{" "}
                      <span className="text-xs font-normal text-slate-600 dark:text-slate-400">µg/m³</span>
                    </p>
                    <p className="text-[10px] text-slate-400">{maxPmTime ? `${maxPmTime} น.` : "ไม่มีข้อมูล"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 shadow-2xs dark:border-emerald-950 dark:bg-emerald-950/20">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300">
                    <ArrowDown className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">ค่าต่ำสุดคาดการณ์</p>
                    <p className="text-base font-extrabold text-emerald-900 dark:text-emerald-100">
                      {minPmVal != null ? minPmVal : "—"}{" "}
                      <span className="text-xs font-normal text-slate-600 dark:text-slate-400">µg/m³</span>
                    </p>
                    <p className="text-[10px] text-slate-400">{minPmTime ? `${minPmTime} น.` : "ไม่มีข้อมูล"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. TIME-WINDOW BREAKDOWN — real 4 segments from hourly data */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                รายละเอียดช่วงเวลา (พยากรณ์วันนี้)
              </h3>
              <div className="space-y-2">
                {[
                  {
                    seg: seg0,
                    label: "ช่วงดีที่สุด (ตั้งแต่เที่ยงคืน)",
                    Icon: Moon,
                    badge: "เช้ามืด",
                  },
                  {
                    seg: seg1,
                    label: "ช่วงเช้า–กลางวัน",
                    Icon: Sun,
                    badge: "กลางวัน",
                  },
                  {
                    seg: seg2,
                    label: "ช่วงบ่าย–เย็น",
                    Icon: CloudSun,
                    badge: "เย็น",
                  },
                  {
                    seg: seg3,
                    label: "ช่วงค่ำ–กลางคืน",
                    Icon: ShieldAlert,
                    badge: "กลางคืน",
                  },
                ].map((item) => {
                  const seg = item.seg;
                  if (!seg) return null;
                  const avgBand = bandForPm25((seg.minPm + seg.maxPm) / 2);
                  return (
                    <div
                      key={item.badge}
                      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3.5 shadow-xs transition hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-3">
                        {/* Translucent circle icon */}
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: `${avgBand.color}18`,
                            border: `1.5px solid ${avgBand.color}30`,
                          }}
                        >
                          <item.Icon
                            className="h-4.5 w-4.5"
                            style={{ color: avgBand.color }}
                          />
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                            {seg.startTime} – {seg.endTime} น.
                          </p>
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            PM2.5 {pmRange(seg.minPm, seg.maxPm)}
                          </p>
                          <p className="text-[10px] text-slate-400">{item.label}</p>
                        </div>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-[10px] font-extrabold text-white shadow-xs"
                        style={{ backgroundColor: avgBand.color }}
                      >
                        {avgBand.labelTh}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Best / Risk highlight from real data */}
              {(bestWindow || riskWindow) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {bestWindow && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 dark:border-emerald-950 dark:bg-emerald-950/20">
                      <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">🌿 ช่วงอากาศดีที่สุด</p>
                      <p className="text-xs font-black text-slate-900 dark:text-white">{bestWindow.startTime} – {bestWindow.endTime} น.</p>
                      <p className="text-[9.5px] text-slate-500">PM2.5 {pmRange(bestWindow.minPm, bestWindow.maxPm)}</p>
                    </div>
                  )}
                  {riskWindow && (
                    <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-2.5 dark:border-orange-950 dark:bg-orange-950/20">
                      <p className="text-[10px] font-bold text-orange-700 dark:text-orange-300">⚠️ ช่วงควรระวัง</p>
                      <p className="text-xs font-black text-slate-900 dark:text-white">{riskWindow.startTime} – {riskWindow.endTime} น.</p>
                      <p className="text-[9.5px] text-slate-500">PM2.5 {pmRange(riskWindow.minPm, riskWindow.maxPm)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 7. 7-DAY FORECAST LIST — real daily data */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                  พยากรณ์ 7 วัน
                </h3>
                <Link
                  href="/"
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  ดูทั้งหมด <ChevronRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="space-y-1.5 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                {forecast.daily.map((d, index) => {
                  const band = d.airQualityClass
                    ? bandForAqi(pm25ToAqi(d.pm25))
                    : bandForPm25(d.pm25);
                  const dateObj = new Date(d.t);
                  const aqiVal = pm25ToAqi(d.pm25);
                  const isUp = index > 0 && d.pm25 > forecast.daily[index - 1].pm25;
                  const isDown = index > 0 && d.pm25 < forecast.daily[index - 1].pm25;

                  return (
                    <div
                      key={d.t}
                      className="flex items-center justify-between rounded-xl p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <div className="w-20">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {formatThaiDayFull(dateObj, index)}
                        </p>
                        <p className="text-[10px] text-slate-400">{formatThaiShortDate(dateObj)}</p>
                      </div>

                      <div className="flex h-7 w-7 items-center justify-center">
                        {band.level <= 1 ? (
                          <Sun className="h-5 w-5 text-amber-500" />
                        ) : band.level === 2 ? (
                          <CloudSun className="h-5 w-5 text-amber-500" />
                        ) : (
                          <CloudRain className="h-5 w-5 text-slate-500" />
                        )}
                      </div>

                      <span className="w-16 text-center font-mono text-[11px] text-slate-400">
                        {d.pm25P10 != null && d.pm25P90 != null
                          ? `${Math.round(d.pm25P10)} – ${Math.round(d.pm25P90)}`
                          : `— µg`}
                      </span>

                      <span className="w-8 text-center text-sm font-extrabold text-slate-900 tabular-nums dark:text-white">
                        {aqiVal}
                      </span>

                      <span
                        className="w-16 rounded-full py-0.5 text-center text-[10px] font-bold text-white shadow-2xs"
                        style={{ backgroundColor: band.color }}
                      >
                        {d.labelTh ?? band.labelTh}
                      </span>

                      <div className="w-5 text-center">
                        {isUp ? (
                          <ArrowUp className="h-3.5 w-3.5 text-rose-500" />
                        ) : isDown ? (
                          <ArrowDown className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3 text-rose-500" /> เพิ่มขึ้นจากวันก่อน</span>
                <span className="flex items-center gap-1"><ArrowDown className="h-3 w-3 text-emerald-500" /> ลดลงจากวันก่อน</span>
                <span className="flex items-center gap-1"><Minus className="h-3 w-3 text-slate-400" /> คงที่จากวันก่อน</span>
              </div>
            </div>

            {/* 8. AI INSIGHT — real weather data */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                  ปัจจัยส่งผลต่อคุณภาพอากาศวันนี้
                </h3>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  ความมั่นใจโมเดล {confidenceVal}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {/* Wind — real */}
                <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                    <Wind className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {windLabel ?? "ลม"}
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      {windSpeed != null ? `${windSpeed.toFixed(1)} m/s` : "ไม่มีข้อมูล"}
                    </p>
                    <p className="text-[9px] text-slate-400">{windDesc ?? ""}</p>
                  </div>
                </div>

                {/* Rain — real */}
                <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <CloudRain className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {rainLabel ?? "ฝน"}
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      {precipitation != null ? `${precipitation.toFixed(1)} mm` : "ไม่มีข้อมูล"}
                    </p>
                    <p className="text-[9px] text-slate-400">{rainDesc ?? ""}</p>
                  </div>
                </div>

                {/* Hotspot — real */}
                <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">
                    <Flame className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {hotspotLabel}
                    </p>
                    <p className="text-[9px] text-slate-400">{hotspotDesc}</p>
                  </div>
                </div>

                {/* Humidity — real */}
                <div className="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
                    <Droplets className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {humidLabel ?? "ความชื้น"}
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      {humidity != null ? `${Math.round(humidity)}%` : "ไม่มีข้อมูล"}
                    </p>
                    <p className="text-[9px] text-slate-400">{humidDesc ?? ""}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 9. RISING PROVINCES — sorted by real pm25Delta */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                  จังหวัดที่มีฝุ่นสูงในภูมิภาค
                </h3>
                <Link href="/" className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                  ดูทั้งหมด <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-1.5">
                {topRisingProvinces.map((p, index) => {
                  const pm = p.pm25 ?? 0;
                  const delta = p.pm25Delta;
                  const pBand = bandForPm25(pm);
                  return (
                    <div key={p.province.id} className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: pBand.color }}>
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{p.province.nameTh}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {fmtPm25(pm)} µg/m³
                        </span>
                        {delta != null ? (
                          delta > 0 ? (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-500">
                              <ArrowUp className="h-3 w-3" />+{delta.toFixed(1)}
                            </span>
                          ) : delta < 0 ? (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-500">
                              <ArrowDown className="h-3 w-3" />{delta.toFixed(1)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                              <Minus className="h-3 w-3" />0
                            </span>
                          )
                        ) : (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: pBand.color }}
                          >
                            {pBand.labelTh}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 10. HEALTH RECOMMENDATIONS — คำแนะนำสุขภาพ */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                คำแนะนำสุขภาพ
              </h3>
              <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="space-y-3">
                  {((): { icon: typeof PersonStanding; title: string; desc: string; color: string }[] => {
                    if (currentAqi <= 50) {
                      return [
                        { icon: PersonStanding, title: "คนทั่วไป", desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ", color: "#16a34a" },
                        { icon: Baby, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ", color: "#16a34a" },
                        { icon: ShieldCheck, title: "ควรสวมหน้ากาก", desc: "ไม่จำเป็นต้องสวมหน้ากาก N95", color: "#16a34a" },
                        { icon: DoorOpen, title: "การเปิดหน้าต่าง", desc: "สามารถเปิดให้อากาศถ่ายเทได้ตามปกติ", color: "#16a34a" },
                      ];
                    } else if (currentAqi <= 100) {
                      return [
                        { icon: PersonStanding, title: "คนทั่วไป", desc: "ทำกิจกรรมกลางแจ้งได้ แต่ลดเวลาลงบ้าง", color: "#ca8a04" },
                        { icon: Baby, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "ลดกิจกรรมกลางแจ้ง แนะนำสวมหน้ากาก", color: "#ca8a04" },
                        { icon: ShieldCheck, title: "ควรสวมหน้ากาก", desc: "แนะนำให้สวมหน้ากาก N95 เมื่ออยู่กลางแจ้ง", color: "#ca8a04" },
                        { icon: DoorOpen, title: "การเปิดหน้าต่าง", desc: "ลดการเปิดหน้าต่าง เลี่ยงช่วงฝุ่นสูง", color: "#ca8a04" },
                      ];
                    } else {
                      return [
                        { icon: PersonStanding, title: "คนทั่วไป", desc: "หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากาก", color: "#dc2626" },
                        { icon: Baby, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "งดกิจกรรมกลางแจ้ง อยู่ในอาคารที่มีเครื่องฟอกอากาศ", color: "#dc2626" },
                        { icon: ShieldCheck, title: "ควรสวมหน้ากาก", desc: "ต้องสวมหน้ากาก N95 ทุกครั้งที่ออกนอกอาคาร", color: "#dc2626" },
                        { icon: DoorOpen, title: "การเปิดหน้าต่าง", desc: "ปิดหน้าต่างตลอด ใช้เครื่องฟอกอากาศ", color: "#dc2626" },
                      ];
                    }
                  })().map((item) => (
                    <div key={item.title} className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: `${item.color}12`,
                          border: `1.5px solid ${item.color}25`,
                        }}
                      >
                        <item.icon className="h-4 w-4" style={{ color: item.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">{item.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 11. FOOTER NOTICE */}
            <div className="py-2 text-center text-[10px] text-slate-400">
              <p className="font-semibold text-slate-500">หมายเหตุ</p>
              <p>
                การพยากรณ์คำนวณจากโมเดล ML และข้อมูลจากสถานีตรวจวัดจริง
                อาจมีความคลาดเคลื่อนตามสภาพอากาศที่เปลี่ยนแปลง
              </p>
            </div>

            {/* 12. MODEL STATUS FOOTER */}
            <div className="rounded-xl border border-slate-200/70 bg-white p-3 text-[11px] shadow-2xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    สถานะการทำงานและวิธีจัดระดับคุณภาพอากาศ
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    ความน่าเชื่อถือ D+1:{" "}
                    {forecast.daily[0]?.horizonReliability === "evaluated_d1"
                      ? "ผ่านการประเมินย้อนหลัง"
                      : forecast.daily[0]?.horizonReliability ?? "—"}{" "}
                    · วิธีจัดระดับ:{" "}
                    {forecast.fallback.used
                      ? "คำนวณจาก PM2.5 (Threshold)"
                      : "โมเดล Classifier โดยตรง"}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> โมเดลระบบทำงานปกติ
                </span>
              </div>
            </div>

          </div>{/* end LEFT/MAIN COLUMN */}

          {/* ================================================================ */}
          {/* RIGHT SIDEBAR (Desktop only)                                     */}
          {/* ================================================================ */}
          <div className="hidden space-y-4 lg:block lg:col-span-1">

            {/* Sidebar: Live Status */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">สถานะปัจจุบัน</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">PM2.5</span>
                  <strong className="font-extrabold text-emerald-600">{fmtPm25(currentPm25)} µg/m³</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">AQI</span>
                  <strong className="font-extrabold text-slate-900 dark:text-white">{currentAqi}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ระดับ</span>
                  <span
                    className="rounded-full px-3 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: currentBand.color }}
                  >
                    {currentBand.labelTh}
                  </span>
                </div>
                {weather?.temperature != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">อุณหภูมิ</span>
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">{weather.temperature.toFixed(1)} °C</strong>
                  </div>
                )}
                {weather?.humidity != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">ความชื้น</span>
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">{Math.round(weather.humidity)}%</strong>
                  </div>
                )}
                {windSpeed != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">ลม</span>
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">{windSpeed.toFixed(1)} m/s</strong>
                  </div>
                )}
                <div className="mt-2 border-t border-slate-100 pt-2 text-center text-[11px] text-slate-400 dark:border-slate-800">
                  อัปเดตล่าสุด {refreshedTimeStr} น.
                </div>
              </div>
            </div>

            {/* Sidebar: Trend summary */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">แนวโน้มวันนี้</h3>
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
                    forecast.trend === "up"
                      ? "bg-rose-500"
                      : forecast.trend === "down"
                      ? "bg-emerald-500"
                      : "bg-slate-400"
                  }`}
                >
                  {forecast.trend === "up" ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : forecast.trend === "down" ? (
                    <TrendingDown className="h-5 w-5" />
                  ) : (
                    <Minus className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {forecast.trend === "up"
                      ? "ฝุ่นมีแนวโน้มเพิ่มขึ้น"
                      : forecast.trend === "down"
                      ? "ฝุ่นมีแนวโน้มลดลง"
                      : "ฝุ่นทรงตัว"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {forecast.models.regression.name}
                  </p>
                </div>
              </div>
            </div>

            {/* Sidebar: Top Rising Provinces */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">จังหวัดฝุ่นสูงสุด</h3>
              <div className="space-y-2">
                {topRisingProvinces.map((p, index) => {
                  const pBand = bandForPm25(p.pm25 ?? 0);
                  return (
                    <div key={p.province.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: pBand.color }}>
                          {index + 1}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{p.province.nameTh}</span>
                      </div>
                      <strong className="font-bold text-slate-700 dark:text-slate-300">{fmtPm25(p.pm25 ?? 0)} µg/m³</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar: AI Model Confidence */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">ความมั่นใจโมเดล AI</h3>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-extrabold text-emerald-600">{confidenceVal}%</span>
                <span className="mb-1 text-xs text-slate-400">D+1 forecast</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                  style={{ width: `${confidenceVal}%` }}
                />
              </div>
            </div>

          </div>{/* end RIGHT SIDEBAR */}

        </div>{/* end lg:grid */}
      </div>{/* end max-w-7xl container */}
    </div>
  );
}
