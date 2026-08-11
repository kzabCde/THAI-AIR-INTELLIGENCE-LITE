"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { ProvinceSnapshot } from "@/services/types";

export function WatchlistAndGoodAir({
  snapshots = [],
}: {
  snapshots: ProvinceSnapshot[];
}) {
  // Real data filtering: provinces with elevated risk (AQI > 50 or PM2.5 > 37.5)
  const highRiskProvinces = snapshots
    .filter((s) => (s.aqi ?? 0) > 50 || (s.pm25 ?? 0) > 37.5)
    .sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-fg">สถานการณ์ที่ควรรู้</h3>

      {/* Standalone Real Watchlist Card */}
      <div className="rounded-3xl border border-rose-500/20 bg-rose-50/30 dark:bg-rose-950/20 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-black text-rose-600 dark:text-rose-400">
            จังหวัดที่ควรเฝ้าระวัง
          </h4>
          {highRiskProvinces.length > 0 && (
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
              พบ {highRiskProvinces.length} จังหวัดที่มีฝุ่นเกินเกณฑ์
            </span>
          )}
        </div>

        {highRiskProvinces.length > 0 ? (
          <div className="space-y-2">
            {highRiskProvinces.map((s, idx) => (
              <Link
                key={s.province.id}
                href={`/province/${s.province.id}`}
                className="flex items-center justify-between rounded-2xl bg-white/90 dark:bg-zinc-900/90 p-2.5 text-xs font-bold transition hover:bg-white border border-rose-100 dark:border-rose-900/40"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 font-extrabold text-[10px] text-white">
                    {idx + 1}
                  </span>
                  <span className="text-zinc-900 dark:text-zinc-100">{s.province.nameTh}</span>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-black text-rose-600 dark:text-rose-400 tabular-nums">
                  <span>PM2.5: {Math.round(s.pm25 ?? 0)} µg/m³</span>
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px]">
                    AQI {s.aqi ?? 0}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          /* Empty State when 100% of provinces have good/safe air quality */
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2 bg-white/60 dark:bg-zinc-900/60 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40">
            <ShieldCheck size={28} className="text-emerald-500" />
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              ไม่มีจังหวัดที่ต้องเฝ้าระวังในขณะนี้
            </span>
            <span className="text-[10px] font-medium text-zinc-500">
              ทุกจังหวัดในภาคอีสานมีคุณภาพอากาศอยู่ในเกณฑ์ดีและปลอดภัย
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
