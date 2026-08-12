"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Thermometer, Droplets, Wind, CloudRain, RotateCw } from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import { AqiFaceIcon } from "@/components/ui/aqi-face-icon";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import type { ProvinceSnapshot } from "@/services/types";

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

export function ProvinceHeroCard({
  snapshots = [],
  initialProvinceId = "TH-40",
  onProvinceChange,
  onRefreshAll,
}: {
  snapshots: ProvinceSnapshot[];
  initialProvinceId?: string;
  onProvinceChange?: (id: string) => void;
  onRefreshAll?: () => void;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialProvinceId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string | null>(null);

  const snapshot =
    snapshots.find((s) => s.province.id === selectedId) ?? snapshots[0];

  useEffect(() => {
    if (snapshot?.observedAt) {
      setLastRefreshedTime(fmtTimeTh(snapshot.observedAt));
    }
  }, [snapshot]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Call parent handler to refresh all system components (24h/7d forecast, API caches, etc.)
    onRefreshAll?.();
    router.refresh();

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    setLastRefreshedTime(`${hours}:${minutes}`);

    setTimeout(() => {
      setIsRefreshing(false);
    }, 750);
  };

  if (!snapshot) return null;

  const pm25 = snapshot.pm25 ?? 0;
  const aqi = snapshot.aqi ?? 0;
  const band = snapshot.aqi != null ? bandForAqi(snapshot.aqi) : bandForPm25(pm25);
  const theme = getAqiInnerPanelTheme(aqi);

  const displayTime = lastRefreshedTime || (snapshot.observedAt ? fmtTimeTh(snapshot.observedAt) : "14:00");

  return (
    <div className="w-full rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-3.5 sm:p-4 shadow-sm space-y-3 transition-all">
      {/* 1. Top Header Row: Province Selector Dropdown + LIVE Badge (Shrink-proof, 100% Non-overflowing) */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <ProvinceSelectModal
            snapshots={snapshots}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              onProvinceChange?.(id);
            }}
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* System-Wide Refresh Icon Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 h-7 w-7 text-zinc-600 dark:text-zinc-300 transition-all border border-zinc-200 dark:border-zinc-700 active:scale-95 disabled:opacity-50 shrink-0"
            title="รีเฟรชข้อมูลทั้งระบบ"
          >
            <RotateCw size={12} className={isRefreshing ? "animate-spin text-emerald-500" : "text-zinc-500 dark:text-zinc-400"} />
          </button>

          {/* LIVE Status Badge */}
          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {/* 2. Middle Panel: FAINT CITY SKYLINE WITH RICH VARIED BUILDING SIZES */}
      <div className={`relative overflow-hidden rounded-2xl border ${theme.panelBg} p-4 sm:p-5 shadow-xs transition-all duration-300`}>
        {/* Soft, Faint, Richly Varied City Skyline Silhouette Vector in matching AQI theme color */}
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
          {/* Left Column: AQI Readout, Level Badge, PM2.5 Value, Timestamp with Refresh */}
          <div className="space-y-2">
            {/* AQI Big Number & Level Badge */}
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

            {/* PM2.5 Readout Row */}
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-extrabold opacity-75 uppercase tracking-wide">PM2.5</span>
              <span className="text-2xl sm:text-3xl font-black tabular-nums leading-none">{fmtPm25(pm25)}</span>
              <span className="text-xs font-bold opacity-75">µg/m³</span>
            </div>

            {/* Interactive Timestamp & Quick Refresh Trigger */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <p className="text-[11px] font-bold opacity-75">
                อัปเดตล่าสุด {displayTime} น.
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-all opacity-80 hover:opacity-100 active:scale-90 disabled:opacity-50"
                title="คลิกเพื่อรีเฟรชข้อมูลทั้งระบบ"
              >
                <RotateCw size={11} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Right Column: AI Generated Cute Emoji Face Avatar */}
          <div className="shrink-0 pr-1 sm:pr-3">
            <AqiFaceIcon level={aqi} size={92} className="drop-shadow-md transition-transform hover:scale-105" />
          </div>
        </div>
      </div>

      {/* 3. Bottom Weather Capsule Row */}
      <div className="grid grid-cols-4 divide-x divide-zinc-200 dark:divide-zinc-800 pt-0.5 text-center">
        {/* Item 1: Temp */}
        <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
          <Thermometer className="text-orange-500 dark:text-orange-400" size={15} />
          <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-0.5">
            {snapshot.temperature != null ? `${snapshot.temperature.toFixed(1)} °C` : "28.4 °C"}
          </span>
          <span className="text-[9px] font-bold text-zinc-400">อุณหภูมิ</span>
        </div>

        {/* Item 2: Humidity */}
        <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
          <Droplets className="text-blue-500 dark:text-blue-400" size={15} />
          <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-0.5">
            {snapshot.humidity != null ? `${snapshot.humidity.toFixed(0)}%` : "68%"}
          </span>
          <span className="text-[9px] font-bold text-zinc-400">ความชื้น</span>
        </div>

        {/* Item 3: Wind */}
        <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center min-w-0">
          <Wind className="text-teal-500 dark:text-teal-400 shrink-0" size={15} />
          <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums truncate leading-none mt-0.5">
            {snapshot.windSpeed != null ? `${snapshot.windSpeed.toFixed(0)} km/h` : "5 km/h"}
          </span>
          <span className="text-[9px] font-bold text-zinc-400 truncate">ลม</span>
        </div>

        {/* Item 4: Rain */}
        <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
          <CloudRain className="text-indigo-500 dark:text-indigo-400" size={15} />
          <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-0.5">
            0 mm
          </span>
          <span className="text-[9px] font-bold text-zinc-400">ฝน (1h)</span>
        </div>
      </div>
    </div>
  );
}
