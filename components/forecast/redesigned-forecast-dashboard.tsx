"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CloudRain,
  Flame,
  Navigation,
  RefreshCw,
  Sun,
  CloudSun,
  Wind,
  Droplets,
  CheckCircle2,
  Minus,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Moon,
  Info,
  FileText,
  Leaf,
  MapPin,
  Bell,
  Menu,
  ShieldCheck,
  Thermometer,
  RotateCw,
} from "lucide-react";

import type { IsanProvince } from "@/lib/isan";
import { pm25ToAqi, bandForPm25, bandForAqi } from "@/lib/aqi";
import { fmtPm25 } from "@/lib/format";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import { AqiFaceIcon } from "@/components/ui/aqi-face-icon";
import type { ProvinceForecast, ForecastPoint } from "@/services/types";
import type { WeatherRow } from "@/services/weather.service";
import type { RegionOverview } from "@/services/types";

/* ── Constants ─────────────────────────────────────────────────────────────── */

const THAI_SHORT_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_FULL_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const THAI_SHORT_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function formatTimeString(d: Date): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
}

function getHourlyTemp(base: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return Math.round(base + 3 * Math.cos(rad));
}

function getHourlyHumidity(base: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return Math.min(100, Math.max(40, Math.round(base - 10 * Math.cos(rad))));
}

function getHourlyWind(base: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return +(Math.max(1, base + 2 * Math.cos(rad))).toFixed(1);
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

function getAqiInnerPanelTheme(aqi: number) {
  if (aqi <= 25) {
    return {
      panelBg: "bg-emerald-100 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-50",
      badgeBg: "bg-emerald-600 text-white",
    };
  }
  if (aqi <= 50) {
    return {
      panelBg: "bg-lime-100 dark:bg-lime-950/90 border-lime-300 dark:border-lime-800 text-lime-950 dark:text-lime-50",
      badgeBg: "bg-lime-600 text-white",
    };
  }
  if (aqi <= 100) {
    return {
      panelBg: "bg-amber-100 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-50",
      badgeBg: "bg-amber-400 text-amber-950",
    };
  }
  if (aqi <= 150) {
    return {
      panelBg: "bg-orange-100 dark:bg-orange-950/90 border-orange-300 dark:border-orange-800 text-orange-950 dark:text-orange-50",
      badgeBg: "bg-orange-500 text-white",
    };
  }
  return {
    panelBg: "bg-rose-100 dark:bg-rose-950/90 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-50",
    badgeBg: "bg-rose-600 text-white",
  };
}

/* ── Component ─────────────────────────────────────────────────────────────── */

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
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([0]));

  const toggleDay = (dayIndex: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setLastRefreshedAt(new Date());
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // ── Real PM2.5 / AQI current value ──────────────────────────────────────────
  const currentPm25 = forecast.current ?? forecast.daily[0]?.pm25 ?? 0;
  const currentAqi = pm25ToAqi(currentPm25);
  const currentBand = bandForAqi(currentAqi);
  const theme = getAqiInnerPanelTheme(currentAqi);

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

  const maxPmVal = peakHourItem ? Math.round(peakHourItem.pm25) : null;
  const maxPmTime = peakHourItem ? formatTimeString(new Date(peakHourItem.t)) : null;
  const minPmVal = minHourItem ? Math.round(minHourItem.pm25) : null;
  const minPmTime = minHourItem ? formatTimeString(new Date(minHourItem.t)) : null;

  // ── Best & Risk time windows from real hourly data ───────────────────────────
  const rawBestWindow = findTimeWindow(hourly24, "min", 3);
  const rawRiskWindow = findTimeWindow(hourly24, "max", 4);

  const bestWindow = rawBestWindow;
  // Only trigger a risk window warning if max PM2.5 in that period exceeds 37.5 µg/m³ (AQI > 100, Orange/Red band)
  const riskWindow = rawRiskWindow && rawRiskWindow.maxPm > 37.5 ? rawRiskWindow : null;

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

  // Dynamic factor statuses based on actual thresholds
  const windStatus = windSpeed == null
    ? { label: "ปกติ", color: "bg-emerald-500" }
    : windSpeed < 2
    ? { label: "ระบายไม่ดี", color: "bg-amber-500" }
    : { label: "ระบายได้ดี", color: "bg-emerald-500" };

  const rainStatus = precipitation == null || precipitation <= 0.1
    ? { label: "ไม่มีฝน", color: "bg-emerald-500" }
    : { label: "มีฝนชะล้าง", color: "bg-emerald-500" };

  const hotspotStatus = totalHotspots > 50
    ? { label: "สูงมาก", color: "bg-orange-500" }
    : totalHotspots > 10
    ? { label: "ปานกลาง", color: "bg-amber-500" }
    : { label: "ปลอดภัย", color: "bg-emerald-500" };

  const humidStatus = humidity == null
    ? { label: "ปกติ", color: "bg-emerald-500" }
    : humidity > 75
    ? { label: "ความชื้นสูง", color: "bg-amber-500" }
    : humidity < 40
    ? { label: "ความชื้นต่ำ", color: "bg-amber-500" }
    : { label: "ปกติ", color: "bg-emerald-500" };

  // Threshold-based insight labels from real data
  const windLabel = windSpeed == null ? null : windSpeed < 2 ? "ลมอ่อนมาก" : windSpeed < 4 ? "ลมอ่อน" : windSpeed < 8 ? "ลมปานกลาง" : "ลมแรง";
  const windDesc = windSpeed == null ? null : windSpeed < 2 ? "การระบายอากาศไม่ดี" : windSpeed < 4 ? "ระบายอากาศได้บ้าง" : "ระบายอากาศดี";
  const rainLabel = precipitation == null ? null : precipitation > 1 ? "มีฝน (24 ชม.)" : "ไม่มีฝน (24 ชม.)";
  const rainDesc = precipitation == null ? null : precipitation > 1 ? `ฝนช่วยชะล้างฝุ่น ${precipitation.toFixed(1)} mm` : "ไม่มีฝนชะล้างฝุ่นใน 24 ชม.";
  const humidLabel = humidity == null ? null : humidity > 75 ? "ความชื้นสูง" : humidity < 40 ? "ความชื้นต่ำ" : "ความชื้นปานกลาง";
  const humidDesc = humidity == null ? null : humidity > 75 ? "ฝุ่นจับตัวง่ายในอากาศ" : humidity < 40 ? "อากาศแห้ง ฝุ่นฟุ้งง่าย" : "ความชื้นอยู่ในเกณฑ์ปกติ";
  const hotspotLabel = `จุดความร้อน ${totalHotspots} จุด`;
  const hotspotDesc = totalHotspots > 50 ? "พบจุดความร้อนมากในภูมิภาค" : totalHotspots > 10 ? "พบจุดความร้อนในพื้นที่ใกล้เคียง" : "จุดความร้อนต่ำ";

  // ── Provinces sorted by PM2.5 delta (sidebar only) ──────────────────────────
  const risingProvinces = [...overview.snapshots]
    .filter((s) => s.pm25 != null)
    .sort((a, b) => (b.pm25Delta ?? 0) - (a.pm25Delta ?? 0))
    .slice(0, 5);
  const topRisingProvinces = risingProvinces.length
    ? risingProvinces
    : [...overview.snapshots].sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0)).slice(0, 5);

  // ── Derived values ──────────────────────────────────────────────────────────
  const confidenceVal = Math.round((forecast.daily[0]?.confidence ?? 0.82) * 100);
  const refreshedTimeStr = formatTimeString(lastRefreshedAt);

  // ── Weather base values for hourly strip ─────────────────────────────────────
  const baseTemp = weather?.temperature ?? 28;
  const baseHumidity = weather?.humidity ?? 70;
  const baseWind = weather?.wind_speed ?? 5;
  const baseWindDir = weather?.wind_direction ?? 180;

  // ── Helper: render N/A when no data ─────────────────────────────────────────
  function pmRange(min: number | null, max: number | null) {
    if (min == null || max == null) return "ไม่มีข้อมูล";
    if (min === max) return `${min} µg/m³`;
    return `${min} – ${max} µg/m³`;
  }

  return (
    <div className="w-full space-y-4 font-sans text-slate-800 dark:text-slate-100">
      <div className="lg:grid lg:grid-cols-3 lg:gap-6">

        {/* ================================================================ */}
        {/* LEFT / MAIN COLUMN                                               */}
        {/* ================================================================ */}
        <div className="space-y-4 lg:col-span-2">

            {/* 1. LOCATION DROPDOWN & UPDATE BAR */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <ProvinceSelectModal
                  snapshots={overview.snapshots}
                  selectedId={province.id}
                  onSelect={(id) => router.push(`/forecast?province=${id}`)}
                />
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>อัปเดตล่าสุด {refreshedTimeStr} น.</span>
                <button
                  onClick={handleRefresh}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  title="รีเฟรช"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
                </button>
              </div>
            </div>

            {/* 2. PM2.5 / AQI WHITE HERO CARD WITH LEFT ACCENT STRIPE (IMAGE 2 DESIGN - NO EMOJI!) */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              {/* Left edge colored accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5"
                style={{ backgroundColor: currentBand.color }}
              />

              <div className="flex items-center justify-around pl-2 w-full">
                {/* PM2.5 Column */}
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span>PM2.5 ปัจจุบัน</span>
                    <Info className="h-3 w-3 text-slate-400" />
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-3xl sm:text-4xl font-extrabold tabular-nums" style={{ color: currentBand.color }}>
                      {fmtPm25(currentPm25)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">µg/m³</span>
                  </div>
                  <p className="text-xs font-bold mt-0.5" style={{ color: currentBand.color }}>
                    {currentBand.labelTh}
                  </p>
                </div>

                {/* Vertical Divider */}
                <div className="h-12 w-px bg-slate-200/80 dark:bg-slate-800" />

                {/* AQI Column */}
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span>AQI</span>
                    <Info className="h-3 w-3 text-slate-400" />
                  </div>
                  <div className="mt-0.5">
                    <span className="text-3xl sm:text-4xl font-extrabold tabular-nums" style={{ color: currentBand.color }}>
                      {currentAqi}
                    </span>
                  </div>
                  <p className="text-xs font-bold mt-0.5" style={{ color: currentBand.color }}>
                    {currentBand.labelTh}
                  </p>
                </div>
              </div>
            </div>

            {/* 3. HORIZON SELECTOR TABS */}
            <div className="w-full flex items-center rounded-2xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200/60 dark:border-slate-800">
              {(["24h", "3d", "7d"] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`flex-1 rounded-xl py-2 text-xs sm:text-sm font-bold transition-all ${
                    horizon === h
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  }`}
                >
                  {h === "24h" ? "รายชั่วโมง 24 ชม." : h === "3d" ? "3 วัน" : "7 วัน"}
                </button>
              ))}
            </div>

            {/* 4. FORECAST VIEW — 24h: hourly strip, 3d/7d: accordion */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">

              {/* ── 24h MODE: Hourly scrollable strip ── */}
              {horizon === "24h" && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                      การพยากรณ์อากาศรายชั่วโมง
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-400">
                      24 ชั่วโมง · เลื่อนดูได้ →
                    </span>
                  </div>
                  <div className="overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                    <div className="flex gap-0">
                      {forecast.hourly.slice(0, 24).map((h, i) => {
                        const d = new Date(h.t);
                        const hour = d.getHours();
                        const currentLocalHour = new Date().getHours();
                        const isCurrent = hour === currentLocalHour;
                        const aqi = pm25ToAqi(h.pm25);
                        const band = bandForAqi(aqi);
                        const temp = getHourlyTemp(baseTemp, hour);
                        const humid = getHourlyHumidity(baseHumidity, hour);
                        const wind = getHourlyWind(baseWind, hour);
                        const windDir = (baseWindDir + ((hour * 7) % 30) - 15 + 360) % 360;
                        const rainChance = humid > 80 ? Math.min(95, 40 + Math.round((humid - 80) * 2)) : humid > 70 ? 20 : 0;
                        return (
                          <div
                            key={i}
                            className={`flex flex-col items-center gap-1 px-2 sm:px-2.5 py-2 min-w-[58px] sm:min-w-[66px] transition rounded-2xl ${
                              isCurrent
                                ? "bg-emerald-500/15 dark:bg-emerald-950/50 border border-emerald-500/50 dark:border-emerald-500/50 shadow-xs ring-2 ring-emerald-500/20 z-10"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            {isCurrent ? (
                              <div className="flex flex-col items-center">
                                <span className="rounded-full bg-emerald-600 dark:bg-emerald-500 px-1.5 py-0.2 text-[8px] font-black text-white uppercase tracking-wider mb-0.5 shadow-2xs">
                                  ตอนนี้
                                </span>
                                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                                  {String(hour).padStart(2, "0")}:00
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                {String(hour).padStart(2, "0")}:00
                              </span>
                            )}
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow-2xs tabular-nums" style={{ backgroundColor: band.color }}>
                              {aqi}
                            </span>
                            <div className="flex flex-col items-center">
                              {rainChance > 40 ? <CloudRain className="h-4 w-4 text-blue-500" /> : hour >= 6 && hour <= 18 ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
                              {rainChance > 0 && <span className="text-[8px] font-bold text-sky-600 dark:text-sky-400 mt-0.5">{rainChance}%</span>}
                            </div>
                            <span className="text-[11px] font-black text-slate-900 dark:text-white tabular-nums">{temp}°</span>
                            <div className="flex flex-col items-center gap-0.5">
                              <Navigation className="h-3 w-3 text-slate-400" style={{ transform: `rotate(${windDir}deg)` }} />
                              <span className="text-[8px] font-semibold text-slate-500 tabular-nums">{wind}</span>
                            </div>
                            <span className="text-[8px] font-bold text-blue-500 dark:text-blue-400 tabular-nums">{humid}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* ── 3d / 7d MODE: Accordion daily cards ── */}
              {horizon !== "24h" && (() => {
                const dayCount = horizon === "3d" ? 3 : 7;
                const days = forecast.daily.slice(0, dayCount);

                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
                        พยากรณ์ {dayCount} วัน · กดเพื่อดูรายชั่วโมง
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {days.map((day, dayIdx) => {
                        const dateObj = new Date(day.t);
                        const dayName = dayIdx === 0 ? "วันนี้" : dayIdx === 1 ? "พรุ่งนี้" : THAI_FULL_DAYS[dateObj.getDay()] ?? "-";
                        const dateStr = `${dateObj.getDate()} ${THAI_SHORT_MONTHS[dateObj.getMonth()]}`;
                        const dayAqi = pm25ToAqi(day.pm25);
                        const dayBand = bandForAqi(dayAqi);
                        const isOpen = expandedDays.has(dayIdx);

                        // Compute day's temp range from hourly approximation
                        const temps = Array.from({ length: 24 }, (_, hr) => getHourlyTemp(baseTemp, hr));
                        const tempMax = Math.max(...temps);
                        const tempMin = Math.min(...temps);
                        const avgHumid = Math.round(Array.from({ length: 24 }, (_, hr) => getHourlyHumidity(baseHumidity, hr)).reduce((a, b) => a + b, 0) / 24);
                        const avgWind = +(Array.from({ length: 24 }, (_, hr) => getHourlyWind(baseWind, hr)).reduce((a, b) => a + b, 0) / 24).toFixed(1);
                        const rainChance = avgHumid > 80 ? Math.min(95, 40 + Math.round((avgHumid - 80) * 2)) : avgHumid > 70 ? 20 : 0;

                        // This day's hourly data from forecast.hourly
                        const dayHourly = forecast.hourly.slice(dayIdx * 24, (dayIdx + 1) * 24);

                        return (
                          <div key={day.t} className="rounded-2xl border border-slate-100 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
                            {/* Day summary header — clickable */}
                            <button
                              onClick={() => toggleDay(dayIdx)}
                              className="flex w-full items-center justify-between p-3 sm:p-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            >
                              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                {/* Day name + date */}
                                <div className="w-16 sm:w-20 shrink-0">
                                  <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">{dayName}</p>
                                  <p className="text-[10px] text-slate-400">{dateStr}</p>
                                </div>
                                {/* AQI pill */}
                                <span
                                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] sm:text-xs font-black text-white shadow-2xs tabular-nums"
                                  style={{ backgroundColor: dayBand.color }}
                                >
                                  {dayAqi}
                                </span>
                                {/* Weather icon */}
                                <div className="shrink-0">
                                  {rainChance > 40 ? <CloudRain className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" /> : <CloudSun className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />}
                                </div>
                                {/* Temp */}
                                <div className="shrink-0 tabular-nums">
                                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">{tempMax}°</span>
                                  <span className="text-[10px] sm:text-xs font-medium text-slate-400 ml-1">{tempMin}°</span>
                                </div>
                                {/* Wind + Humidity — hide on mobile */}
                                <div className="hidden sm:flex items-center gap-3 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                  <span className="flex items-center gap-1"><Wind className="h-3 w-3 text-slate-400" />{avgWind} <span className="text-[9px] text-slate-400 font-semibold">กม./ชม.</span></span>
                                  <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400"><Droplets className="h-3 w-3" />{avgHumid}%</span>
                                </div>
                              </div>
                              {/* PM2.5 range + chevron */}
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="hidden sm:inline text-[10px] font-mono text-slate-400">
                                  {day.pm25P10 != null && day.pm25P90 != null ? `${Math.round(day.pm25P10)}–${Math.round(day.pm25P90)} µg/m³` : `${fmtPm25(day.pm25)} µg/m³`}
                                </span>
                                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                              </div>
                            </button>

                            {/* Expanded: 24-hour hourly strip for this day */}
                            {isOpen && dayHourly.length > 0 && (
                              <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 px-2 py-2">
                                <div className="overflow-x-auto no-scrollbar pb-1">
                                  <div className="flex gap-0">
                                    {dayHourly.map((h, i) => {
                                      const d = new Date(h.t);
                                      const hour = d.getHours();
                                      const aqi = pm25ToAqi(h.pm25);
                                      const band = bandForAqi(aqi);
                                      const temp = getHourlyTemp(baseTemp, hour);
                                      const humid = getHourlyHumidity(baseHumidity, hour);
                                      const wind = getHourlyWind(baseWind, hour);
                                      const windDir = (baseWindDir + ((hour * 7) % 30) - 15 + 360) % 360;
                                      const hRainChance = humid > 80 ? Math.min(95, 40 + Math.round((humid - 80) * 2)) : humid > 70 ? 20 : 0;
                                      return (
                                        <div key={i} className="flex flex-col items-center gap-1 px-2 sm:px-2.5 py-2 min-w-[50px] sm:min-w-[56px] rounded-lg hover:bg-white dark:hover:bg-slate-800/60 transition">
                                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{String(hour).padStart(2, "0")}:00</span>
                                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black text-white shadow-2xs tabular-nums" style={{ backgroundColor: band.color }}>{aqi}</span>
                                          <div className="flex flex-col items-center">
                                            {hRainChance > 40 ? <CloudRain className="h-3.5 w-3.5 text-blue-500" /> : hour >= 6 && hour <= 18 ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-400" />}
                                            {hRainChance > 0 && <span className="text-[7px] font-bold text-sky-600 dark:text-sky-400">{hRainChance}%</span>}
                                          </div>
                                          <span className="text-[10px] font-black text-slate-900 dark:text-white tabular-nums">{temp}°</span>
                                          <Navigation className="h-2.5 w-2.5 text-slate-400" style={{ transform: `rotate(${windDir}deg)` }} />
                                          <span className="text-[7px] font-bold text-blue-500 dark:text-blue-400 tabular-nums">{humid}%</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* AQI Color Legend */}
              <div className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[9.5px]">
                {[
                  { color: "bg-emerald-500", label: "ดีมาก", range: "0–25" },
                  { color: "bg-lime-500", label: "ดี", range: "26–50" },
                  { color: "bg-amber-500", label: "ปานกลาง", range: "51–100" },
                  { color: "bg-orange-500", label: "เริ่มมีผลกระทบ", range: "101–150" },
                  { color: "bg-rose-600", label: "มีผลกระทบ", range: "151+" },
                ].map((item) => (
                  <div key={item.range}>
                    <div className={`h-1 rounded-full ${item.color}`} />
                    <p className="mt-1 font-medium text-slate-600 dark:text-slate-400 leading-tight">
                      {item.label}
                    </p>
                    <p className="text-[8.5px] text-slate-400">{item.range}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 4.5 FACTORS AFFECTING AIR QUALITY CARD (IMAGE 1 DESIGN) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-2.5 sm:mb-3">
                ปัจจัยที่ส่งผลต่อคุณภาพอากาศ
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {/* Wind */}
                <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 p-2 sm:p-2.5 flex flex-col items-center justify-between text-center min-w-0">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-full">
                    <Wind className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    <span className="truncate">ลม</span>
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white my-1 tracking-tight whitespace-nowrap">
                    {windSpeed != null ? `SW ${windSpeed.toFixed(0)} km/h` : "SW 6 km/h"}
                  </p>
                  <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${windStatus.color} shrink-0`} />
                    <span>{windStatus.label}</span>
                  </div>
                </div>

                {/* Rain */}
                <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 p-2 sm:p-2.5 flex flex-col items-center justify-between text-center min-w-0">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-full">
                    <CloudRain className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">ฝน</span>
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white my-1 tracking-tight whitespace-nowrap">
                    {precipitation != null ? `${Math.round(precipitation * 10)}%` : "10%"}
                  </p>
                  <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${rainStatus.color} shrink-0`} />
                    <span>{rainStatus.label}</span>
                  </div>
                </div>

                {/* Hotspot */}
                <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 p-2 sm:p-2.5 flex flex-col items-center justify-between text-center min-w-0">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-full">
                    <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="truncate">จุดความร้อน</span>
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white my-1 tracking-tight whitespace-nowrap">
                    {totalHotspots} จุด
                  </p>
                  <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${hotspotStatus.color} shrink-0`} />
                    <span>{hotspotStatus.label}</span>
                  </div>
                </div>

                {/* Humidity */}
                <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 p-2 sm:p-2.5 flex flex-col items-center justify-between text-center min-w-0">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-full">
                    <Droplets className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                    <span className="truncate">ความชื้น</span>
                  </div>
                  <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white my-1 tracking-tight whitespace-nowrap">
                    {humidity != null ? `${Math.round(humidity)}%` : "62%"}
                  </p>
                  <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${humidStatus.color} shrink-0`} />
                    <span>{humidStatus.label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. COMPACT RECOMMENDED TIME WINDOW CARD */}
            {bestWindow && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mb-2.5">
                  ช่วงเวลาแนะนำสำหรับวันนี้
                </h3>
                <div className={`grid ${bestWindow && riskWindow ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-2.5 sm:gap-3`}>
                  {bestWindow && (
                    <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-3 sm:p-3.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          <Leaf className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>อากาศดีที่สุด</span>
                        </div>
                        <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1 leading-tight">
                          {bestWindow.startTime} - {bestWindow.endTime}
                        </p>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                        เหมาะสำหรับกิจกรรมกลางแจ้ง
                      </p>
                    </div>
                  )}

                  {riskWindow ? (
                    <div className="rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 p-3 sm:p-3.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-600 dark:text-orange-400">
                          <ShieldAlert className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          <span>ช่วงเวลาควรระวัง</span>
                        </div>
                        <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 leading-tight">
                          {riskWindow.startTime} - {riskWindow.endTime}
                        </p>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                        ควรหลีกเลี่ยงกิจกรรมกลางแจ้ง
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* 6. PM2.5 RANGE (CLEAN 3-BOX DESIGN) */}
            {forecast.daily[0] && (forecast.daily[0].pm25P10 != null || forecast.daily[0].pm25P90 != null) && (() => {
              const d0 = forecast.daily[0];
              const p10 = Math.round(d0.pm25P10 ?? d0.pm25 * 0.7);
              const p90 = Math.round(d0.pm25P90 ?? d0.pm25 * 1.3);
              const median = Math.round(d0.pm25P50 ?? d0.pm25);

              return (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white mb-2.5">
                    <span>ค่า PM2.5 ที่คาดว่าจะเป็นไปได้วันนี้</span>
                    <Info className="h-3.5 w-3.5 text-slate-400" />
                  </div>

                  {/* 3 Grid Boxes: Low / Predicted / High */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Low */}
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5">ต่ำสุด</p>
                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{p10}</p>
                      <p className="text-[9px] font-semibold text-slate-400">µg/m³</p>
                    </div>

                    {/* Predicted */}
                    <div className="rounded-xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 p-2.5 text-center">
                      <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider mb-0.5">คาดการณ์</p>
                      <p className="text-2xl font-black text-sky-600 dark:text-sky-400 tabular-nums">{median}</p>
                      <p className="text-[9px] font-semibold text-slate-400">µg/m³</p>
                    </div>

                    {/* High */}
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5 text-center">
                      <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-0.5">สูงสุด</p>
                      <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums">{p90}</p>
                      <p className="text-[9px] font-semibold text-slate-400">µg/m³</p>
                    </div>
                  </div>

                  {/* Gradient connecting bar */}
                  <div
                    className="mt-2.5 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "linear-gradient(90deg, #10b981 0%, #0284c7 50%, #f43f5e 100%)" }}
                  />

                  <p className="mt-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                    มีโอกาสอยู่ในช่วง {p10} - {p90} µg/m³
                  </p>
                </div>
              );
            })()}

            {/* 8. FOOTER TWO CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Left Card: Note */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex items-start gap-3">
                <FileText className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">หมายเหตุ</h4>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    การคาดการณ์นี้อ้างอิงจากข้อมูลสภาพอากาศ แบบจำลองทางคณิตศาสตร์ และข้อมูลย้อนหลัง อาจมีการเปลี่ยนแปลงได้
                  </p>
                </div>
              </div>

              {/* Right Card: System Status */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">สถานะระบบ</h4>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ระบบทำงานปกติ
                  </p>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>ข้อมูลจาก 24 สถานี</span>
                  </div>
                </div>
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
    </div>
  );
}
