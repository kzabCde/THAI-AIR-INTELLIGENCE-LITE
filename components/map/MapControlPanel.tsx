"use client";

import { RotateCcw, Search } from "lucide-react";
import { THAI_REGION_ORDER, type ThaiRegionName } from "@/lib/map/region-colors";
import type { DisplayMode } from "@/lib/map/province-region";

type MapControlPanelProps = {
  search: string;
  region: "all" | ThaiRegionName;
  mode: DisplayMode;
  aqiCategory: string;
  onSearchChange: (value: string) => void;
  onRegionChange: (value: "all" | ThaiRegionName) => void;
  onModeChange: (value: DisplayMode) => void;
  onAqiCategoryChange: (value: string) => void;
  onReset: () => void;
};

export function MapControlPanel({
  search,
  region,
  mode,
  aqiCategory,
  onSearchChange,
  onRegionChange,
  onModeChange,
  onAqiCategoryChange,
  onReset,
}: MapControlPanelProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">ตัวกรองแผนที่</h2>
          <p className="text-xs text-slate-400">ค้นหาและเลือกโหมดการแสดงผลรายจังหวัด</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          ล้างตัวกรอง
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">ค้นหาจังหวัด</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="ค้นหาจังหวัด..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/10"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">ภูมิภาค</span>
          <select
            value={region}
            onChange={(event) => onRegionChange(event.target.value as "all" | ThaiRegionName)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 py-2.5 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
          >
            <option value="all">ทุกภูมิภาค</option>
            {THAI_REGION_ORDER.map((regionName) => (
              <option key={regionName} value={regionName}>{regionName}</option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">โหมดแสดงผล</span>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
            <ModeButton active={mode === "region"} onClick={() => onModeChange("region")} label="แบ่งตามภาค" />
            <ModeButton active={mode === "aqi"} onClick={() => onModeChange("aqi")} label="แสดงตาม AQI" />
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">AQI category filter</span>
          <select
            value={aqiCategory}
            onChange={(event) => onAqiCategoryChange(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-900 py-2.5 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
          >
            <option value="all">ทุกระดับ AQI</option>
            <option value="good">ดี</option>
            <option value="moderate">ปานกลาง</option>
            <option value="sensitive">เริ่มมีผลกระทบต่อกลุ่มเสี่ยง</option>
            <option value="unhealthy">มีผลกระทบต่อสุขภาพขึ้นไป</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20"
        : "rounded-xl px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"}
    >
      {label}
    </button>
  );
}
