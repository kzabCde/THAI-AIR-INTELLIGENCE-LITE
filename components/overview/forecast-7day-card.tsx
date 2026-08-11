"use client";

import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import { bandForAqi } from "@/lib/aqi";

export function Forecast7dayCard({ currentAqi = 68 }: { currentAqi?: number }) {
  const daysOfWeek = ["วันนี้", "พรุ่งนี้", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
  const icons = ["⛅", "⛅", "🌤️", "☀️", "☀️", "⛅", "🌤️"];
  
  // Forecast AQI trend simulation
  const aqiValues = [
    currentAqi,
    Math.max(20, Math.round(currentAqi * 0.95)),
    Math.max(20, Math.round(currentAqi * 0.8)),
    Math.max(20, Math.round(currentAqi * 0.6)),
    Math.max(20, Math.round(currentAqi * 0.5)),
    Math.max(20, Math.round(currentAqi * 0.7)),
    Math.max(20, Math.round(currentAqi * 0.85)),
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface-1 p-6 shadow-medium flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
            <Calendar size={18} className="text-purple-500" />
            พยากรณ์ 7 วันข้างหน้า
          </h3>
          <p className="muted text-xs">คาดการณ์ระดับคุณภาพอากาศล่วงหน้า 7 วัน</p>
        </div>

        <Link
          href="/forecast"
          className="group inline-flex items-center gap-1 text-xs font-semibold text-purple-600 hover:underline dark:text-purple-400"
        >
          ดูทั้งหมด
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {daysOfWeek.map((day, idx) => {
          const aqi = aqiValues[idx];
          const band = bandForAqi(aqi);

          return (
            <div
              key={idx}
              className="flex flex-col items-center justify-between rounded-2xl border border-border/50 bg-surface-2/30 p-2.5 transition hover:bg-surface-2/80"
            >
              <span className="text-[11px] font-bold muted">{day}</span>
              <span className="text-2xl my-1">{icons[idx]}</span>
              <div>
                <span className="block text-sm font-extrabold tabular-nums text-fg">{aqi}</span>
                <span
                  className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs"
                  style={{ backgroundColor: band.color }}
                >
                  {band.labelTh}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
