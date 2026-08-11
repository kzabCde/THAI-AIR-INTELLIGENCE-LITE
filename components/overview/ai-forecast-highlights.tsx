"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { bandForAqi, pm25ToAqi } from "@/lib/aqi";
import { AqiFaceIcon } from "@/components/ui/aqi-face-icon";
import type { ProvinceForecast, ForecastPoint } from "@/services/types";

const THAI_SHORT_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_SHORT_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

function formatThaiDay(d: Date): string {
  return THAI_SHORT_DAYS[d.getDay()];
}

function formatThaiDate(d: Date): string {
  return `${d.getDate()} ${THAI_SHORT_MONTHS[d.getMonth()]}`;
}

function getDotColor(aqi: number) {
  if (aqi <= 25) return "#10b981"; // Emerald
  if (aqi <= 50) return "#84cc16"; // Lime
  if (aqi <= 100) return "#facc15"; // Yellow
  if (aqi <= 150) return "#f97316"; // Orange
  return "#ef4444"; // Red
}

export function AiForecastHighlights({
  provinceId = "TH-40",
  avgAqi = 68,
}: {
  provinceId?: string;
  avgAqi?: number;
}) {
  const [forecast, setForecast] = useState<ProvinceForecast | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch real ML forecast predictions from Supabase via /api/forecast?province={provinceId}
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch(`/api/forecast?province=${provinceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        // Unwrap API response helper structure { success: true, data: ProvinceForecast }
        const data: ProvinceForecast | null = json?.data ?? json;
        if (isMounted && data && Array.isArray(data.daily)) {
          setForecast(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [provinceId]);

  // Extract 24-hour diurnal points (8 points spaced 3h apart)
  const hourlyPoints: ForecastPoint[] = forecast?.hourly?.slice(0, 24) ?? [];
  const data24h = hourlyPoints.length >= 8
    ? hourlyPoints.filter((_, idx) => idx % 3 === 0).slice(0, 8).map((p: ForecastPoint) => ({
        time: new Date(p.t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
        aqi: pm25ToAqi(p.pm25),
        pm25: Math.round(p.pm25),
      }))
    : [
        { time: "00:00", aqi: 22, pm25: 10 },
        { time: "03:00", aqi: 20, pm25: 9 },
        { time: "06:00", aqi: 24, pm25: 11 },
        { time: "09:00", aqi: 27, pm25: 12 },
        { time: "12:00", aqi: 42, pm25: 19 },
        { time: "15:00", aqi: 58, pm25: 26 },
        { time: "18:00", aqi: 62, pm25: 28 },
        { time: "21:00", aqi: 48, pm25: 21 },
      ];

  // Extract 7-day forecast points directly from real ML forecast daily rows
  const dailyPoints: ForecastPoint[] = forecast?.daily?.slice(0, 7) ?? [];

  // Dynamic fallback dates from new Date() if no ML points are returned
  const todayDate = new Date();
  const dynamicFallbackDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() + i);
    const aqiVal = Math.round(avgAqi);
    const band = bandForAqi(aqiVal);
    return {
      day: i === 0 ? "วันนี้" : formatThaiDay(d),
      date: formatThaiDate(d),
      aqi: aqiVal,
      label: band.labelTh,
      color: band.color,
      isToday: i === 0,
    };
  });

  const forecast7d = dailyPoints.length > 0
    ? dailyPoints.map((p: ForecastPoint, idx: number) => {
        const d = new Date(p.t);
        const aqiVal = pm25ToAqi(p.pm25);
        const band = bandForAqi(aqiVal);
        return {
          day: idx === 0 ? "วันนี้" : formatThaiDay(d),
          date: formatThaiDate(d),
          aqi: aqiVal,
          label: band.labelTh,
          color: band.color,
          isToday: idx === 0,
        };
      })
    : dynamicFallbackDays;

  // SVG Chart Height & Points calculation for 24h Trend
  const chartHeight = 110;
  const maxVal = Math.max(...data24h.map((d) => d.aqi), 80);
  const minVal = Math.min(...data24h.map((d) => d.aqi), 10);

  const pointsString = data24h
    .map((d, i) => {
      const x = (i / (data24h.length - 1)) * 100;
      const y = chartHeight - ((d.aqi - minVal) / (maxVal - minVal || 1)) * 60 - 25;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-4">
      {/* 1. Card 1: พยากรณ์ PM2.5 24 ชั่วโมงข้างหน้า */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
              พยากรณ์ PM2.5 24 ชั่วโมงข้างหน้า
            </h3>
            {loading && <Loader2 size={13} className="animate-spin text-emerald-600" />}
          </div>
          <Link
            href={`/forecast?province=${provinceId}`}
            className="flex items-center gap-0.5 text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            ดูรายละเอียด
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* 24h Visual Curved SVG Line Chart with Data Values & Dots */}
        <div className="relative pt-6 pb-2">
          <svg className="w-full overflow-visible" height={chartHeight} viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#facc15" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Area Fill under curve */}
            <polygon
              points={`0,${chartHeight} ${pointsString} 100,${chartHeight}`}
              fill="url(#curveGrad)"
            />

            {/* Smooth Curve Line */}
            <polyline
              fill="none"
              stroke="#f97316"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsString}
            />
          </svg>

          {/* Dots, Values, and Time Labels HTML Overlay */}
          <div className="absolute inset-0 flex justify-between pt-1 pointer-events-none">
            {data24h.map((d, i) => {
              const dotColor = getDotColor(d.aqi);
              const yPercent = 100 - (((d.aqi - minVal) / (maxVal - minVal || 1)) * 55 + 25);

              return (
                <div key={i} className="flex flex-col items-center flex-1 relative">
                  {/* AQI Value on top of dot */}
                  <span
                    className="absolute text-[11px] font-black text-zinc-900 dark:text-zinc-100 tabular-nums -translate-y-6"
                    style={{ top: `${yPercent}%` }}
                  >
                    {d.aqi}
                  </span>

                  {/* Colored Dot on Line */}
                  <span
                    className="absolute h-3 w-3 rounded-full border-2 border-white dark:border-zinc-900 shadow-xs"
                    style={{ top: `${yPercent}%`, backgroundColor: dotColor, transform: "translateY(-50%)" }}
                  />

                  {/* Time Label at bottom */}
                  <span className="absolute bottom-0 text-[10px] font-semibold text-zinc-500">
                    {d.time}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend Row */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/80">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> ดีมาก (0-25)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-lime-500" /> ดี (26-50)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> ปานกลาง (51-100)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> เริ่มมีผลกระทบ (101-150)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> มีผลกระทบ (151+)
          </span>
        </div>
      </div>

      {/* 2. Card 2: พยากรณ์ 7 วันข้างหน้า */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
          พยากรณ์ 7 วันข้างหน้า
        </h3>

        {/* 7 Columns Row */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
          {forecast7d.map((item, idx) => (
            <div
              key={idx}
              className={`flex flex-col items-center justify-between rounded-2xl py-3 px-1 transition ${
                item.isToday
                  ? "bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 shadow-xs"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              {/* Day & Date Header */}
              <div className="text-center">
                <span className="block text-xs font-black text-zinc-900 dark:text-zinc-100">
                  {item.day}
                </span>
                <span className="block text-[9px] font-medium text-zinc-400">
                  {item.date}
                </span>
              </div>

              {/* Vector SVG Face Icon */}
              <div className="my-2">
                <AqiFaceIcon level={item.aqi} size={36} />
              </div>

              {/* AQI Value & Label */}
              <div>
                <span className="block text-sm font-black text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {item.aqi}
                </span>
                <span
                  className="block text-[9px] font-bold truncate max-w-[50px] mx-auto mt-0.5"
                  style={{ color: item.color }}
                >
                  {item.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
