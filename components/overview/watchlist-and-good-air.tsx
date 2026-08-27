"use client";

import Link from "next/link";
import { ShieldCheck, AlertTriangle } from "lucide-react";
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

  const hasRisk = highRiskProvinces.length > 0;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white/80 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        {hasRisk ? (
          <AlertTriangle size={14} className="text-amber-500" />
        ) : (
          <ShieldCheck size={14} className="text-emerald-500" />
        )}
        <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
          {hasRisk ? "จังหวัดที่ควรเฝ้าระวัง" : "สถานการณ์อากาศ"}
        </h3>
        {hasRisk && (
          <span className="ml-auto rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            {highRiskProvinces.length} จังหวัด
          </span>
        )}
      </div>

      {hasRisk ? (
        <div className="space-y-1.5">
          {highRiskProvinces.map((s, idx) => (
            <Link
              key={s.province.id}
              href={`/province/${s.province.id}`}
              className="flex items-center justify-between rounded-xl bg-zinc-50/80 p-2.5 text-xs transition hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {idx + 1}
                </span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {s.province.nameTh}
                </span>
              </div>

              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {Math.round(s.pm25 ?? 0)} µg/m³
                </span>
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  AQI {s.aqi ?? 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty State — all provinces safe */
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50/50 p-3.5 dark:bg-emerald-950/10">
          <ShieldCheck size={20} className="shrink-0 text-emerald-400" />
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ทุกจังหวัดอยู่ในเกณฑ์ปลอดภัย
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
              ไม่มีจังหวัดที่ต้องเฝ้าระวังในขณะนี้
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
