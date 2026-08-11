"use client";

import Link from "next/link";
import { Flame, Wind, CloudRain, ChevronRight } from "lucide-react";

export function MapBottomCards({
  totalHotspots = 126,
  windSpeed = 8,
  windDirection = "ตะวันออกเฉียงเหนือ",
  rainChance = 10,
}: {
  totalHotspots?: number;
  windSpeed?: number;
  windDirection?: string;
  rainChance?: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
      {/* Card 1: จุดความร้อนวันนี้ (Compact 1-row item) */}
      <div className="rounded-2xl border border-red-200/80 dark:border-red-900/50 bg-gradient-to-br from-red-50/40 via-white to-orange-50/30 dark:from-red-950/40 dark:via-zinc-900 dark:to-orange-950/30 p-2.5 sm:p-3 shadow-xs flex items-center justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
            <Flame size={16} className="fill-red-500/20 text-red-500" />
          </div>
          <div className="min-w-0">
            <span className="block text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 truncate">
              จุดความร้อน
            </span>
            <div className="flex items-baseline gap-1 leading-none mt-0.5">
              <span className="text-sm sm:text-base font-black text-red-600 dark:text-red-400 tabular-nums">
                {totalHotspots}
              </span>
              <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400">จุด</span>
            </div>
          </div>
        </div>

        <Link
          href="/analytics"
          title="ดูรายละเอียดจุดความร้อน"
          className="hidden md:inline-flex items-center gap-0.5 rounded-full border border-red-200 dark:border-red-800 bg-white/80 dark:bg-zinc-800/80 px-2 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400 hover:bg-white transition shrink-0"
        >
          ดูเพิ่มเติม
          <ChevronRight size={10} />
        </Link>
      </div>

      {/* Card 2: ทิศทางลมหลัก (Compact 1-row item) */}
      <div className="rounded-2xl border border-teal-200/80 dark:border-teal-900/50 bg-gradient-to-br from-teal-50/40 via-white to-sky-50/30 dark:from-teal-950/40 dark:via-zinc-900 dark:to-sky-950/30 p-2.5 sm:p-3 shadow-xs flex items-center gap-2 min-w-0">
        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <Wind size={16} className="text-teal-500" />
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 truncate">
            ทิศทางลมหลัก
          </span>
          <div className="flex items-baseline gap-1 leading-none mt-0.5 min-w-0">
            <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">
              {windDirection}
            </span>
            <span className="hidden lg:inline-block text-[10px] font-extrabold text-teal-600 dark:text-teal-400 tabular-nums shrink-0">
              {windSpeed}km/h
            </span>
          </div>
        </div>
      </div>

      {/* Card 3: คาดการณ์ฝน (Compact 1-row item) */}
      <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/40 via-white to-blue-50/30 dark:from-indigo-950/40 dark:via-zinc-900 dark:to-blue-950/30 p-2.5 sm:p-3 shadow-xs flex items-center gap-2 min-w-0">
        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <CloudRain size={16} className="text-indigo-500" />
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 truncate">
            โอกาสฝนวันนี้
          </span>
          <div className="flex items-baseline gap-0.5 leading-none mt-0.5">
            <span className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
              {rainChance}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
