"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CloudRain,
  Droplets,
  Flame,
  Gauge,
  RotateCw,
  Thermometer,
  Wind,
} from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import { fmtDateTh, fmtPm25, fmtTimeTh, fmtNumber, isHotspotDataStale } from "@/lib/format";
import { ZONE_LABELS } from "@/lib/isan";
import { AqiFaceIcon } from "@/components/ui/aqi-face-icon";
import { AiForecastHighlights } from "@/components/overview/ai-forecast-highlights";
import {
  ForecastCard,
  HistoryCard,
  HourlyAirCard,
  HourlyWeatherCard,
} from "@/components/province/province-charts";
import type { ProvinceSnapshot, ProvinceForecast, TimePoint } from "@/services/types";
import type { DailyPoint } from "@/services/daily-summary.service";

/* ─── AQI Theme (same as homepage ProvinceHeroCard) ─── */
function getAqiInnerPanelTheme(aqi: number) {
  if (aqi <= 25) return { panelBg: "bg-emerald-100 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-50", badgeBg: "bg-emerald-600 text-white" };
  if (aqi <= 50) return { panelBg: "bg-lime-100 dark:bg-lime-950/90 border-lime-300 dark:border-lime-800 text-lime-950 dark:text-lime-50", badgeBg: "bg-lime-600 text-white" };
  if (aqi <= 100) return { panelBg: "bg-amber-100 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-50", badgeBg: "bg-amber-400 text-amber-950" };
  if (aqi <= 150) return { panelBg: "bg-orange-100 dark:bg-orange-950/90 border-orange-300 dark:border-orange-800 text-orange-950 dark:text-orange-50", badgeBg: "bg-orange-500 text-white" };
  return { panelBg: "bg-rose-100 dark:bg-rose-950/90 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-50", badgeBg: "bg-rose-600 text-white" };
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
export function ProvinceDetailDashboard({
  snapshot,
  airHistory,
  weatherHistory,
  dailyHistory,
  forecast,
}: {
  snapshot: ProvinceSnapshot;
  airHistory: TimePoint[];
  weatherHistory: TimePoint[];
  dailyHistory: DailyPoint[];
  forecast: ProvinceForecast;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string | null>(null);

  const province = snapshot.province;
  const pm25 = snapshot.pm25 ?? 0;
  const aqi = snapshot.aqi ?? 0;
  const band = snapshot.aqi != null ? bandForAqi(snapshot.aqi) : bandForPm25(pm25);
  const theme = getAqiInnerPanelTheme(aqi);

  const displayTime = lastRefreshedTime || (snapshot.observedAt ? fmtTimeTh(snapshot.observedAt) : "–");

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    router.refresh();
    const now = new Date();
    setLastRefreshedTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    setTimeout(() => setIsRefreshing(false), 750);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      {/* ─── BACK LINK ─── */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-600 shadow-xs transition hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-emerald-600 dark:hover:text-emerald-300"
      >
        <ArrowLeft size={14} /> ภาพรวม
      </Link>

      {/* ═══════════════════════════════════════════
          1. HERO CARD (exact same design as homepage)
          ═══════════════════════════════════════════ */}
      <div className="w-full rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-3.5 sm:p-4 shadow-sm space-y-3 transition-all">
        {/* Top: Province name + Refresh + LIVE */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-zinc-900 dark:text-white truncate">
                {province.nameTh}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 h-7 w-7 text-zinc-600 dark:text-zinc-300 transition-all border border-zinc-200 dark:border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
              title="รีเฟรชข้อมูลทั้งระบบ"
            >
              <RotateCw size={12} className={isRefreshing ? "animate-spin text-emerald-500" : "text-zinc-500 dark:text-zinc-400"} />
            </button>
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>LIVE</span>
            </div>
          </div>
        </div>

        {/* Middle Panel: AQI readout + Face Icon (same as homepage) */}
        <div className={`relative overflow-hidden rounded-2xl border ${theme.panelBg} p-4 sm:p-5 shadow-xs transition-all duration-300`}>
          {/* City Skyline SVG (same as homepage) */}
          <svg
            className="absolute bottom-0 right-0 h-24 sm:h-28 w-4/5 text-current opacity-20 dark:opacity-15 pointer-events-none z-0"
            viewBox="0 0 800 120"
            fill="currentColor"
            preserveAspectRatio="none"
            style={{
              maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,1) 100%)",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,1) 100%)",
            }}
          >
            <path d="M0,120 L0,110 L12,110 L12,120 L20,120 L20,95 L45,95 L45,120 L55,120 L55,75 L62,75 L62,50 L65,50 L65,75 L75,75 L75,120 L85,120 L85,100 L115,100 L115,120 L125,120 L125,60 L130,60 L130,40 L133,40 L133,60 L140,60 L140,120 L150,120 L150,90 L160,90 L160,120 L170,120 L170,80 Q185,60 200,80 L200,120 L210,120 L210,55 L245,55 L245,120 L255,120 L255,105 L270,105 L270,120 L280,120 L280,70 L285,70 L285,35 L288,35 L288,70 L295,70 L295,120 L305,120 L305,85 L335,85 L335,120 L345,120 L345,65 L365,65 L365,120 L375,120 L375,95 L415,95 L415,120 L425,120 L425,45 L430,45 L430,25 L433,25 L433,45 L440,45 L440,120 L450,120 L450,80 L460,80 L460,120 L470,120 L470,105 L510,105 L510,120 L520,120 L520,60 L525,60 L525,40 L528,40 L528,60 L535,60 L535,120 L545,120 L545,75 L565,75 L565,120 L575,120 L575,90 L615,90 L615,120 L625,120 L625,50 L630,50 L630,30 L633,30 L633,50 L640,50 L640,120 L650,120 L650,70 L675,70 L675,120 L685,120 L685,85 L725,85 L725,120 L735,120 L735,60 L740,60 L740,38 L743,38 L743,60 L750,60 L750,120 L760,120 L760,100 L795,100 L795,120 L800,120 Z" />
          </svg>

          <div className="relative z-10 flex items-center justify-between gap-4 py-0.5">
            {/* Left: AQI + PM2.5 readout */}
            <div className="space-y-2">
              {/* AQI Big Number + Level Badge */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight leading-none">
                    {aqi}
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold tracking-wider uppercase opacity-85">
                    AQI
                  </span>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black shadow-xs ${theme.badgeBg}`}>
                  {band.labelTh}
                </span>
              </div>

              {/* PM2.5 Readout */}
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-extrabold opacity-75 uppercase tracking-wide">PM2.5</span>
                <span className="text-2xl sm:text-3xl font-black tabular-nums leading-none">{fmtPm25(pm25)}</span>
                <span className="text-xs font-bold opacity-75">µg/m³</span>
              </div>

              {/* Update time */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <p className="text-[11px] font-bold opacity-75">
                  อัปเดตล่าสุด {displayTime} น.
                </p>
              </div>
            </div>

            {/* Right: AQI Face Icon */}
            <div className="shrink-0 pr-1 sm:pr-3">
              <AqiFaceIcon level={aqi} size={92} className="drop-shadow-md transition-transform hover:scale-105" />
            </div>
          </div>
        </div>

        {/* Bottom Weather Capsule Row (same as homepage) */}
        <div className="grid grid-cols-4 divide-x divide-zinc-200 dark:divide-zinc-800 pt-0.5 text-center">
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            <Thermometer className="text-orange-500 dark:text-orange-400" size={15} />
            <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-0.5">
              {snapshot.temperature != null ? `${snapshot.temperature.toFixed(1)} °C` : "– °C"}
            </span>
            <span className="text-[9px] font-bold text-zinc-400">อุณหภูมิ</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            <Droplets className="text-blue-500 dark:text-blue-400" size={15} />
            <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-0.5">
              {snapshot.humidity != null ? `${snapshot.humidity.toFixed(0)}%` : "–"}
            </span>
            <span className="text-[9px] font-bold text-zinc-400">ความชื้น</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center min-w-0">
            <Wind className="text-teal-500 dark:text-teal-400 shrink-0" size={15} />
            <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums truncate leading-none mt-0.5">
              {snapshot.windSpeed != null ? `${snapshot.windSpeed.toFixed(0)} km/h` : "–"}
            </span>
            <span className="text-[9px] font-bold text-zinc-400 truncate">ลม</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            <CloudRain className="text-indigo-500 dark:text-indigo-400" size={15} />
            <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-0.5">
              {snapshot.precipitation24h != null ? `${snapshot.precipitation24h.toFixed(1)} mm` : "–"}
            </span>
            <span className="text-[9px] font-bold text-zinc-400">ฝน (24h)</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          2. AIR QUALITY DETAILS (AQI + PM10 + Hotspots in 1 Row)
          ═══════════════════════════════════════════ */}
      <div className="space-y-2.5">
        <h2 className="text-sm font-black text-zinc-900 dark:text-white">คุณภาพอากาศล่าสุด</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* AQI */}
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-sm">
            <AqiFaceIcon level={aqi} size={40} className="shrink-0 drop-shadow-sm" />
            <div>
              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">ดัชนีคุณภาพอากาศ</p>
              <p className="text-xl font-black tabular-nums text-zinc-900 dark:text-white sm:text-2xl">
                {snapshot.aqi ?? "–"} <span className="text-xs font-bold text-zinc-400">AQI</span>
              </p>
            </div>
          </div>

          {/* PM10 */}
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
              <Gauge size={20} />
            </span>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">PM10</p>
              <p className="text-xl font-black tabular-nums text-zinc-900 dark:text-white sm:text-2xl">
                {fmtPm25(snapshot.pm10)} <span className="text-xs font-bold text-zinc-400">µg/m³</span>
              </p>
            </div>
          </div>

          {/* Hotspots */}
          <div className="flex items-center gap-3 rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-3.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">
              <Flame size={20} />
            </span>
            <div>
              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 sm:text-xs">
                🔥 จุดความร้อน (FIRMS)
              </p>
              <p className="text-xl font-black tabular-nums text-zinc-900 dark:text-white sm:text-2xl">
                {fmtNumber(snapshot.hotspotCount)} <span className="text-xs font-bold text-zinc-400">จุด</span>
              </p>
              <p className="mt-0.5 text-[9px] font-medium text-zinc-400 dark:text-zinc-500 truncate max-w-[150px]">
                {snapshot.hotspotDate
                  ? isHotspotDataStale(snapshot.hotspotDate)
                    ? `ไม่พบข้อมูลใหม่ตั้งแต่ ${fmtDateTh(snapshot.hotspotDate)}`
                    : `ดาวเทียม FIRMS · ${fmtDateTh(snapshot.hotspotDate)}`
                  : "ไม่มีข้อมูลจากดาวเทียม FIRMS"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          4. AI FORECAST HIGHLIGHTS (same component as homepage)
          ═══════════════════════════════════════════ */}
      <AiForecastHighlights
        provinceId={province.id}
        avgAqi={aqi}
        refreshKey={refreshKey}
        currentWeather={{
          temperature: snapshot.temperature,
          humidity: snapshot.humidity,
          windSpeed: snapshot.windSpeed,
          windDirection: snapshot.windDirection,
          precipitation: snapshot.precipitation,
          precipitation24h: snapshot.precipitation24h,
        }}
      />

      {/* ═══════════════════════════════════════════
          5. HOURLY CHARTS (72h)
          ═══════════════════════════════════════════ */}
      {airHistory.length > 0 && <HourlyAirCard hourly={airHistory} />}
      {weatherHistory.length > 0 && <HourlyWeatherCard hourly={weatherHistory} />}

      {/* ═══════════════════════════════════════════
          6. FORECAST CHART
          ═══════════════════════════════════════════ */}
      <ForecastCard hourly={forecast.hourly} daily={forecast.daily} />

      {/* ═══════════════════════════════════════════
          7. DAILY HISTORY (90 days)
          ═══════════════════════════════════════════ */}
      <HistoryCard daily={dailyHistory} />

      {/* ─── Footer ─── */}
      {airHistory.length > 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {province.nameTh} ({province.nameEn}) · {ZONE_LABELS[province.zone].th} · {province.id}
          </p>
          <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-500">
            ข้อมูลรายชั่วโมง {airHistory.length} จุด · ข้อมูลรายวัน {dailyHistory.length} วัน · ฐานข้อมูล Supabase
          </p>
        </div>
      )}
    </div>
  );
}
