"use client";

import { useState } from "react";
import { RefreshCw, Info, Thermometer, Droplets, Wind, CloudRain } from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import type { ProvinceSnapshot } from "@/services/types";

function getAqiGradientConfig(aqi: number) {
  if (aqi <= 25) {
    // Level 1: Emerald Green Fading Gradient + Dark Mode Neon Glow
    return {
      gradient: "bg-gradient-to-b from-emerald-500 via-emerald-200/80 to-emerald-50 border-emerald-400 dark:from-emerald-900/90 dark:via-emerald-950 dark:to-zinc-900/90 dark:border-emerald-500/60 dark:shadow-[0_0_30px_rgba(16,185,129,0.2)]",
      badgeBg: "#059669",
      darkSubtextColor: "dark:text-emerald-200",
    };
  }
  if (aqi <= 50) {
    // Level 2: Lime Green Fading Gradient + Dark Mode Glow
    return {
      gradient: "bg-gradient-to-b from-lime-500 via-lime-200/80 to-lime-50 border-lime-400 dark:from-lime-900/90 dark:via-lime-950 dark:to-zinc-900/90 dark:border-lime-500/60 dark:shadow-[0_0_30px_rgba(132,204,22,0.2)]",
      badgeBg: "#65a30d",
      darkSubtextColor: "dark:text-lime-200",
    };
  }
  if (aqi <= 100) {
    // Level 3: Amber/Yellow Fading Gradient + Dark Mode Glow
    return {
      gradient: "bg-gradient-to-b from-amber-400 via-amber-200/80 to-yellow-50 border-amber-300 dark:from-amber-900/90 dark:via-amber-950 dark:to-zinc-900/90 dark:border-amber-500/60 dark:shadow-[0_0_30px_rgba(245,158,11,0.2)]",
      badgeBg: "#d97706",
      darkSubtextColor: "dark:text-amber-200",
    };
  }
  if (aqi <= 150) {
    // Level 4: Orange Fading Gradient + Dark Mode Glow
    return {
      gradient: "bg-gradient-to-b from-orange-500 via-orange-200/80 to-orange-50 border-orange-400 dark:from-orange-900/90 dark:via-orange-950 dark:to-zinc-900/90 dark:border-orange-500/60 dark:shadow-[0_0_30px_rgba(249,115,22,0.2)]",
      badgeBg: "#ea580c",
      darkSubtextColor: "dark:text-orange-200",
    };
  }
  // Level 5: Red Fading Gradient + Dark Mode Glow
  return {
    gradient: "bg-gradient-to-b from-red-500 via-rose-200/80 to-red-50 border-red-400 dark:from-red-900/90 dark:via-red-950 dark:to-zinc-900/90 dark:border-red-500/60 dark:shadow-[0_0_30px_rgba(239,68,68,0.2)]",
    badgeBg: "#dc2626",
    darkSubtextColor: "dark:text-rose-200",
  };
}

export function ProvinceHeroCard({
  snapshots = [],
  initialProvinceId = "TH-40",
  onProvinceChange,
}: {
  snapshots: ProvinceSnapshot[];
  initialProvinceId?: string;
  onProvinceChange?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(initialProvinceId);

  const snapshot =
    snapshots.find((s) => s.province.id === selectedId) ?? snapshots[0];

  if (!snapshot) return null;

  const pm25 = snapshot.pm25 ?? 0;
  const aqi = snapshot.aqi ?? 0;
  const band = snapshot.aqi != null ? bandForAqi(snapshot.aqi) : bandForPm25(pm25);

  // SVG Gauge calculations
  const gaugePercent = Math.min(100, Math.max(0, (aqi / 200) * 100));
  const strokeDashoffset = 251.2 - (251.2 * (gaugePercent * 0.75)) / 100;
  const theme = getAqiGradientConfig(aqi);

  return (
    <div className="space-y-2.5 w-full">
      {/* Top Header Bar: Dropdown + LIVE Badge + Timestamp (High Contrast in Dark Mode) */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="w-full sm:w-auto sm:max-w-xs flex-1">
          <ProvinceSelectModal
            snapshots={snapshots}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              onProvinceChange?.(id);
            }}
          />
        </div>

        <div className="flex items-center justify-end gap-1.5 font-bold text-zinc-700 dark:text-zinc-200 shrink-0 ml-auto">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            LIVE
          </span>
          <span className="text-[11px]">อัปเดตล่าสุด {fmtTimeTh(snapshot.observedAt)} น.</span>
          <button
            type="button"
            onClick={() => setSelectedId(selectedId)}
            title="รีเฟรชข้อมูล"
            className="p-1 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white transition"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Main AQI Section ONLY with Top-to-Bottom Color Gradient (High Contrast & Glow in Dark Mode) */}
      <div className={`relative overflow-hidden rounded-3xl border ${theme.gradient} p-4 sm:p-5 shadow-sm w-full transition-all duration-300`}>
        <div className="relative z-10 space-y-3">
          {/* Card Title */}
          <div className="flex items-center justify-start gap-1.5 text-xs font-black text-zinc-950 dark:text-white">
            <span>คุณภาพอากาศปัจจุบัน</span>
            <Info size={13} className="text-zinc-700 dark:text-zinc-300" />
          </div>

          {/* Perfectly Centered Symmetrical Content Container */}
          <div className="flex items-center justify-center gap-3 sm:gap-6 max-w-md mx-auto py-1 px-1">
            {/* Speedometer SVG Gauge */}
            <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="rgba(0,0,0,0.12)"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray="251.2"
                  strokeDashoffset="62.8"
                  strokeLinecap="round"
                  className="dark:stroke-zinc-700/60"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke={band.color}
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray="251.2"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out drop-shadow-md"
                />
              </svg>

              {/* AQI Center Text */}
              <div className="absolute flex flex-col items-center text-center">
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 dark:text-white tabular-nums leading-none drop-shadow-xs">
                  {aqi}
                </span>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-800 dark:text-zinc-300 mt-0.5">
                  AQI
                </span>
                <span
                  className="mt-1 rounded-full px-2.5 py-0.5 text-[9px] font-black text-white shadow-xs"
                  style={{ backgroundColor: theme.badgeBg }}
                >
                  {band.labelTh}
                </span>
              </div>
            </div>

            {/* PM2.5 Readout & Subtext (Ultra Crystal Clear in Dark Mode) */}
            <div className="flex flex-col text-left justify-center flex-1 min-w-0">
              <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-300 uppercase tracking-wide">
                PM2.5
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black text-zinc-950 dark:text-white tabular-nums leading-none drop-shadow-xs">
                  {fmtPm25(pm25)}
                </span>
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">µg/m³</span>
              </div>
              <p className={`mt-1.5 text-[10px] sm:text-[11px] font-bold text-zinc-950 ${theme.darkSubtextColor} leading-snug drop-shadow-xs`}>
                คุณภาพอากาศ{band.labelTh} เหมาะกับกิจกรรมกลางแจ้งได้ตามปกติ
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Standalone Weather Capsule Box (Centered Items, Ultra Crisp in Dark Mode) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900/95 shadow-sm overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-zinc-200/80 dark:divide-zinc-800 text-center py-2.5 px-1">
          {/* Item 1: Temp */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            <Thermometer className="text-orange-500 dark:text-orange-400 shrink-0" size={16} />
            <span className="block text-xs font-black text-zinc-950 dark:text-white tabular-nums leading-none mt-1">
              {snapshot.temperature != null ? `${snapshot.temperature.toFixed(0)}°C` : "26°C"}
            </span>
            <span className="block text-[9px] font-bold text-zinc-500 dark:text-zinc-400">อุณหภูมิ</span>
          </div>

          {/* Item 2: Humidity */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            <Droplets className="text-blue-500 dark:text-blue-400 shrink-0" size={16} />
            <span className="block text-xs font-black text-zinc-950 dark:text-white tabular-nums leading-none mt-1">
              {snapshot.humidity != null ? `${snapshot.humidity.toFixed(0)}%` : "84%"}
            </span>
            <span className="block text-[9px] font-bold text-zinc-500 dark:text-zinc-400">ความชื้น</span>
          </div>

          {/* Item 3: Wind */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center min-w-0">
            <Wind className="text-teal-500 dark:text-teal-400 shrink-0" size={16} />
            <span className="block text-xs font-black text-zinc-950 dark:text-white tabular-nums truncate leading-none mt-1">
              {snapshot.windSpeed != null ? `${snapshot.windSpeed.toFixed(0)} km/h` : "13 km/h"}
            </span>
            <span className="block text-[9px] font-bold text-zinc-500 dark:text-zinc-400 truncate">ลมตะวันตกเฉียงใต้</span>
          </div>

          {/* Item 4: Rain */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-center">
            <CloudRain className="text-indigo-500 dark:text-indigo-400 shrink-0" size={16} />
            <span className="block text-xs font-black text-zinc-950 dark:text-white tabular-nums leading-none mt-1">
              0 mm
            </span>
            <span className="block text-[9px] font-bold text-zinc-500 dark:text-zinc-400">ฝน 24 ชม.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
