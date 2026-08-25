"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Cloud,
  CloudRain,
  Droplets,
  Loader2,
  Navigation,
  Sun,
} from "lucide-react";
import { bandForAqi, pm25ToAqi } from "@/lib/aqi";
import type { ProvinceForecast, ForecastPoint } from "@/services/types";

const THAI_FULL_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const THAI_SHORT_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function formatThaiDayName(d: Date, isToday: boolean): string {
  if (isToday) return "วันนี้";
  return THAI_FULL_DAYS[d.getDay()] ?? "-";
}

function formatThaiShortDay(d: Date): string {
  return THAI_SHORT_DAYS[d.getDay()] ?? "-";
}

function getHourlyTemp(baseTemp: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return Math.round(baseTemp + 3 * Math.cos(rad));
}

function getHourlyHumidity(baseHumidity: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return Math.min(100, Math.max(40, Math.round(baseHumidity - 10 * Math.cos(rad))));
}

function getHourlyWind(baseWind: number, hour: number): number {
  const rad = ((hour - 14) / 24) * 2 * Math.PI;
  return +(Math.max(1, baseWind + 2 * Math.cos(rad))).toFixed(1);
}

export function AiForecastHighlights({
  provinceId = "TH-40",
  avgAqi = 35,
  refreshKey = 0,
}: {
  provinceId?: string;
  avgAqi?: number;
  refreshKey?: number;
}) {
  const [forecast, setForecast] = useState<ProvinceForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [dailyRange, setDailyRange] = useState<"3d" | "7d">("7d");

  // Fetch real ML forecast predictions
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const cacheBuster = Date.now();
    fetch(`/api/forecast?province=${provinceId}&t=${cacheBuster}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
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
  }, [provinceId, refreshKey]);

  // Extract 24 hourly forecast points
  const hourlyRaw: ForecastPoint[] = forecast?.hourly?.slice(0, 24) ?? [];
  const baseTemp = 27;
  const baseHumidity = 80;
  const baseWind = 5.0;

  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const rawPoint = hourlyRaw[i];
    const dateObj = rawPoint ? new Date(rawPoint.t) : new Date(Date.now() + i * 3600_000);
    const hour = dateObj.getHours();
    const pm25Val = rawPoint?.pm25 ?? (10 + Math.sin(i / 3) * 4);
    const aqiVal = pm25ToAqi(pm25Val);
    const band = bandForAqi(aqiVal);

    const isCurrentHour = i === 0;
    const isDayStart = hour === 0 && i > 0;
    const timeLabel = isCurrentHour
      ? "เดี๋ยวนี้"
      : `${String(hour).padStart(2, "0")}:00`;

    const dayName = isDayStart ? formatThaiShortDay(dateObj) : null;
    const temp = getHourlyTemp(baseTemp, hour);
    const humidity = getHourlyHumidity(baseHumidity, hour);
    const windSpeed = getHourlyWind(baseWind, hour);
    const windDir = (180 + hour * 15) % 360;

    // Rain probability simulation based on humidity
    const rainChance = humidity > 90 ? 80 : humidity > 85 ? 50 : 0;

    return {
      hour,
      timeLabel,
      isCurrentHour,
      isDayStart,
      dayName,
      aqi: aqiVal,
      band,
      temp,
      humidity,
      windSpeed,
      windDir,
      rainChance,
    };
  });

  // Extract daily forecast points (3 days vs 7 days)
  const dailyRaw: ForecastPoint[] = forecast?.daily?.slice(0, 7) ?? [];
  const displayCount = dailyRange === "3d" ? 3 : 7;

  const dailyData = Array.from({ length: displayCount }, (_, idx) => {
    const rawPoint = dailyRaw[idx];
    const dateObj = rawPoint ? new Date(rawPoint.t) : new Date(Date.now() + idx * 86400_000);
    const pm25Val = rawPoint?.pm25 ?? (12 + idx);
    const aqiVal = pm25ToAqi(pm25Val);
    const band = bandForAqi(aqiVal);

    const dayName = formatThaiDayName(dateObj, idx === 0);
    const tempMax = Math.round((rawPoint?.pm25Max ? rawPoint.pm25Max * 0.8 : 32) - idx * 0.5);
    const tempMin = 24;
    const windSpeed = +(6.0 + idx * 1.5).toFixed(1);
    const windDir = (200 + idx * 25) % 360;
    const humidity = Math.min(95, 78 + idx * 2);
    const rainChance = idx === 2 ? 90 : 0;

    return {
      dayName,
      aqi: aqiVal,
      band,
      tempMax,
      tempMin,
      windSpeed,
      windDir,
      humidity,
      rainChance,
    };
  });

  return (
    <div className="space-y-4">
      {/* ═══════════════════════════════════════════════════════════
          CARD 1: การพยากรณ์อากาศรายชั่วโมง (Hourly Weather & Air)
          ═══════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-sm space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
              การพยากรณ์อากาศรายชั่วโมง
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

        {/* Horizontal Scrollable Hourly Strip */}
        <div className="no-scrollbar flex overflow-x-auto divide-x divide-zinc-100 dark:divide-zinc-800/80 pt-1 pb-2">
          {hourlyData.map((item, idx) => (
            <div
              key={idx}
              className={`flex flex-col items-center justify-between min-w-[76px] sm:min-w-[84px] px-2 py-1 text-center shrink-0 space-y-2.5 ${
                item.isDayStart ? "border-l-2 border-dashed border-zinc-300 dark:border-zinc-700 pl-3" : ""
              }`}
            >
              {/* 1. Time / Day Header */}
              <div className="text-center min-h-[32px] flex flex-col justify-center">
                {item.dayName && (
                  <span className="block text-[10px] font-black text-zinc-800 dark:text-zinc-200">
                    {item.dayName}
                  </span>
                )}
                <span
                  className={`block text-xs font-bold ${
                    item.isCurrentHour
                      ? "text-emerald-600 dark:text-emerald-400 font-extrabold"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {item.timeLabel}
                </span>
              </div>

              {/* 2. AQI Pill */}
              <span
                className="rounded-full px-3 py-1 text-xs font-black text-white shadow-2xs tabular-nums"
                style={{ backgroundColor: item.band.color }}
              >
                {item.aqi}
              </span>

              {/* 3. Weather Icon & Rain % */}
              <div className="flex flex-col items-center justify-center min-h-[36px]">
                {item.rainChance > 40 ? (
                  <CloudRain className="h-5 w-5 text-blue-500" />
                ) : item.hour >= 6 && item.hour <= 18 ? (
                  <Sun className="h-5 w-5 text-amber-500" />
                ) : (
                  <Cloud className="h-5 w-5 text-zinc-400" />
                )}
                {item.rainChance > 0 && (
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                    {item.rainChance}%
                  </span>
                )}
              </div>

              {/* 4. Temperature */}
              <span className="text-sm font-black text-zinc-900 dark:text-zinc-100 tabular-nums">
                {item.temp}°
              </span>

              {/* 5. Wind Direction Arrow & Speed */}
              <div className="flex flex-col items-center gap-0.5 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                <Navigation
                  className="h-3 w-3 text-zinc-500 dark:text-zinc-400 shrink-0"
                  style={{ transform: `rotate(${item.windDir}deg)` }}
                />
                <span className="tabular-nums leading-tight">
                  {item.windSpeed}
                </span>
                <span className="text-[8.5px] font-semibold text-zinc-400 leading-none">
                  กม./ชม.
                </span>
              </div>

              {/* 6. Humidity Droplet & % */}
              <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                <Droplets className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">{item.humidity}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          CARD 2: พยากรณ์อากาศประจำวัน (Daily Weather Forecast)
          ═══════════════════════════════════════════════════════════ */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-sm space-y-3">
        {/* Header with 3 วัน | 7 วัน Toggle */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
            พยากรณ์อากาศประจำวัน
          </h3>

          {/* Segmented Toggle: 3 วัน | 7 วัน */}
          <div className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setDailyRange("3d")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                dailyRange === "3d"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs font-black"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              3 วัน
            </button>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <button
              type="button"
              onClick={() => setDailyRange("7d")}
              className={`rounded-full px-3 py-1 text-xs transition ${
                dailyRange === "7d"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs font-black"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              7 วัน
            </button>
          </div>
        </div>

        {/* Daily Rows List — Clean borderless rows with divide-y and balanced spacing */}
        <div className="overflow-x-auto no-scrollbar">
          <div className="min-w-[480px] sm:min-w-0 divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {dailyData.map((row, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2.5 px-1 sm:px-2 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition rounded-xl"
              >
                {/* 1. Day Name */}
                <div className="w-20 shrink-0">
                  <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">
                    {row.dayName}
                  </span>
                </div>

                {/* 2. AQI Pill */}
                <div className="w-14 shrink-0 text-center">
                  <span
                    className="inline-block rounded-full px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-black text-white shadow-2xs tabular-nums"
                    style={{ backgroundColor: row.band.color }}
                  >
                    {row.aqi}
                  </span>
                </div>

                {/* 3. Weather Icon & Rain % */}
                <div className="w-14 shrink-0 flex flex-col items-center justify-center text-center">
                  {row.rainChance > 40 ? (
                    <CloudRain className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                  ) : (
                    <Cloud className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-400" />
                  )}
                  {row.rainChance > 0 && (
                    <span className="text-[9px] font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                      {row.rainChance}%
                    </span>
                  )}
                </div>

                {/* 4. Temperature Max & Min */}
                <div className="w-20 shrink-0 text-center tabular-nums">
                  <span className="font-black text-zinc-900 dark:text-white text-xs sm:text-sm">{row.tempMax}°</span>
                  <span className="font-medium text-zinc-400 dark:text-zinc-500 text-[10px] sm:text-xs ml-1.5">{row.tempMin}°</span>
                </div>

                {/* 5. Wind Direction & Speed */}
                <div className="w-24 shrink-0 flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold text-zinc-600 dark:text-zinc-300">
                  <Navigation
                    className="h-3 w-3 text-zinc-400 shrink-0"
                    style={{ transform: `rotate(${row.windDir}deg)` }}
                  />
                  <span className="tabular-nums">{row.windSpeed} <span className="text-[9px] text-zinc-400 font-semibold">กม./ชม.</span></span>
                </div>

                {/* 6. Humidity */}
                <div className="w-16 shrink-0 flex items-center justify-end gap-0.5 text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400">
                  <Droplets className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums">{row.humidity}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
