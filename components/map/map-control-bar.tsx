"use client";

import { Flame, CloudSun, Wind, Activity } from "lucide-react";
import { ProvinceSelectModal } from "@/components/ui/province-select-modal";
import type { MapFilterMode } from "./types";
import type { ProvinceSnapshot } from "@/services/types";

export function MapControlBar({
  snapshots = [],
  activeMode = "pm25",
  onModeChange,
  selectedProvinceId = "all",
  onProvinceChange,
}: {
  snapshots?: ProvinceSnapshot[];
  activeMode: MapFilterMode;
  onModeChange: (mode: MapFilterMode) => void;
  selectedProvinceId: string;
  onProvinceChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 w-full">
      {/* Scrollable Horizontal Filter Mode Pills */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 w-full sm:w-auto shrink-0">
        {/* PM2.5 Mode */}
        <button
          type="button"
          onClick={() => onModeChange("pm25")}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition ${
            activeMode === "pm25"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
          }`}
        >
          <Activity size={13} />
          <span>PM2.5</span>
        </button>

        {/* AQI Mode */}
        <button
          type="button"
          onClick={() => onModeChange("aqi")}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition ${
            activeMode === "aqi"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
          }`}
        >
          <span>AQI</span>
        </button>

        {/* PM10 Mode */}
        <button
          type="button"
          onClick={() => onModeChange("pm10")}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition ${
            activeMode === "pm10"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
          }`}
        >
          <span>PM10</span>
        </button>

        {/* Hotspot Mode */}
        <button
          type="button"
          onClick={() => onModeChange("hotspot")}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition ${
            activeMode === "hotspot"
              ? "bg-amber-600 text-white shadow-xs"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
          }`}
        >
          <Flame size={13} className={activeMode === "hotspot" ? "text-white" : "text-amber-500"} />
          <span>จุดความร้อน</span>
        </button>

        {/* Weather Mode */}
        <button
          type="button"
          onClick={() => onModeChange("weather")}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition ${
            activeMode === "weather"
              ? "bg-sky-600 text-white shadow-xs"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
          }`}
        >
          <CloudSun size={13} />
          <span>สภาพอากาศ</span>
        </button>

        {/* Wind Mode */}
        <button
          type="button"
          onClick={() => onModeChange("wind")}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold shrink-0 transition ${
            activeMode === "wind"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
          }`}
        >
          <Wind size={13} />
          <span>ลม</span>
        </button>
      </div>

      {/* Right Controls: Custom Province Selector Modal */}
      <div className="w-full sm:w-64 sm:ml-auto">
        <ProvinceSelectModal
          snapshots={snapshots}
          selectedId={selectedProvinceId === "all" ? "TH-40" : selectedProvinceId}
          onSelect={(id) => onProvinceChange(id)}
        />
      </div>
    </div>
  );
}
