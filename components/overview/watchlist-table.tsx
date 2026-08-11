"use client";

import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import type { ProvinceSnapshot } from "@/services/types";

export function WatchlistTable({
  snapshots = [],
}: {
  snapshots?: ProvinceSnapshot[];
}) {
  const sortedWorst = [...snapshots]
    .sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0))
    .slice(0, 5);

  return (
    <div className="rounded-3xl border border-rose-500/20 bg-surface-1 p-6 shadow-medium flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold tracking-tight text-rose-600 dark:text-rose-400 flex items-center gap-2">
            <Flame size={18} className="text-rose-500" />
            จังหวัดที่ควรเฝ้าระวัง
          </h3>
          <Link
            href="/map"
            className="group inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
          >
            ดูทั้งหมด
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Column Headers */}
        <div className="flex items-center justify-between text-[11px] font-extrabold muted px-3 py-1 mb-1">
          <span>จังหวัด</span>
          <div className="flex items-center gap-6">
            <span>PM2.5</span>
            <span>AQI</span>
          </div>
        </div>

        {/* 5 Province Rows */}
        <div className="space-y-2">
          {sortedWorst.map((s, idx) => {
            const pm25 = Math.round(s.pm25 ?? 0);
            const aqi = s.aqi ?? 0;

            return (
              <Link
                key={s.province.id}
                href={`/province/${s.province.id}`}
                className="flex items-center justify-between rounded-2xl border border-border/50 bg-surface-2/30 px-3.5 py-2.5 transition hover:bg-surface-2"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/10 font-black text-xs text-rose-600 dark:text-rose-400">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-xs text-fg">{s.province.nameTh}</span>
                </div>

                <div className="flex items-center gap-6 text-xs font-black tabular-nums">
                  <span className="text-rose-600 dark:text-rose-400 w-8 text-right">{pm25}</span>
                  <span className="text-rose-600 dark:text-rose-400 w-8 text-right">{aqi}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
