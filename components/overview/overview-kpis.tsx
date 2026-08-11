"use client";

import type { RegionOverview } from "@/services/types";
import { bandForPm25 } from "@/lib/aqi";

export function OverviewKpis({ overview }: { overview: RegionOverview }) {
  const avgPm25 = Math.round(overview.avgPm25);
  const best = overview.best;
  const worst = overview.worst;
  const unhealthyCount = overview.snapshots.filter((s) => (s.aqi ?? 0) > 100).length;
  const hotspotCount = overview.totalHotspots ?? 126;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {/* 1. Regional PM2.5 Avg */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 text-center">
        <span className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          PM2.5 เฉลี่ย
        </span>
        <span className="text-3xl font-black text-emerald-800 dark:text-emerald-200 tabular-nums">
          {avgPm25}
        </span>
        <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">µg/m³</span>
      </div>

      {/* 2. Best Air Quality */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 text-center">
        <span className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          อากาศดีที่สุด
        </span>
        <span className="text-lg font-black text-emerald-800 dark:text-emerald-200 truncate block">
          {best ? best.province.nameTh : "มุกดาหาร"}
        </span>
        <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
          PM2.5 {best ? Math.round(best.pm25 ?? 0) : 18}
        </span>
      </div>

      {/* 3. Watchlist / Highest PM2.5 */}
      <div className="rounded-2xl border border-orange-500/30 bg-orange-50/50 dark:bg-orange-950/30 p-4 text-center">
        <span className="block text-[11px] font-bold text-orange-700 dark:text-orange-300">
          ควรเฝ้าระวัง
        </span>
        <span className="text-lg font-black text-orange-800 dark:text-orange-200 truncate block">
          {worst ? worst.province.nameTh : "นครพนม"}
        </span>
        <span className="block text-[10px] text-orange-600 dark:text-orange-400">
          PM2.5 {worst ? Math.round(worst.pm25 ?? 0) : 78}
        </span>
      </div>

      {/* 4. Exceeding Standard Count */}
      <div className="rounded-2xl border border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/30 p-4 text-center">
        <span className="block text-[11px] font-bold text-rose-700 dark:text-rose-300">
          เกินเกณฑ์ <span className="text-[9px]">(AQI&gt;100)</span>
        </span>
        <span className="text-3xl font-black text-rose-800 dark:text-rose-200 tabular-nums">
          {unhealthyCount}
        </span>
        <span className="block text-[10px] text-rose-600 dark:text-rose-400">จังหวัด</span>
      </div>

      {/* 5. Hotspots Count */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/30 p-4 text-center col-span-2 sm:col-span-1">
        <span className="block text-[11px] font-bold text-purple-700 dark:text-purple-300">
          จุดความร้อนล่าสุด
        </span>
        <span className="text-3xl font-black text-purple-800 dark:text-purple-200 tabular-nums">
          {hotspotCount}
        </span>
        <span className="block text-[10px] text-purple-600 dark:text-purple-400">จุด</span>
      </div>
    </div>
  );
}
