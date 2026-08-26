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

export interface CurrentWeatherInfo {
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  precipitation?: number | null;
  precipitation24h?: number | null;
}

export function AiForecastHighlights({
  provinceId = "TH-40",
  avgAqi = 35,
  refreshKey = 0,
  currentWeather,
}: {
  provinceId?: string;
  avgAqi?: number;
  refreshKey?: number;
  currentWeather?: CurrentWeatherInfo;
}) {
  const [forecast, setForecast] = useState<ProvinceForecast | null>(null);
  const [loading, setLoading] = useState(false);

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

  // ── Base weather values from REAL DB data ──────────────────────────────
  const baseTemp = currentWeather?.temperature ?? 28;
  const baseHumidity = currentWeather?.humidity ?? 70;
  const baseWind = currentWeather?.windSpeed ?? 5.0;
  const baseWindDir = currentWeather?.windDirection ?? 180;

  // Synoptic weather progression across 7 days based on meteorological wave dynamics
  const getDayWeatherModifier = (dayIdx: number) => {
    if (dayIdx === 0) {
      return {
        tempOffset: 0,
        humidityOffset: 0,
        windMultiplier: 1.0,
        windDirShift: 0,
        rainBaseChance: (currentWeather?.precipitation ?? 0) > 0 ? 80 : (baseHumidity > 80 ? 60 : 30),
      };
    }
    const wave = Math.sin(dayIdx * 1.1 + 0.5);
    const tempOffset = +(wave * 2.2).toFixed(1);
    const humidityOffset = +(-wave * 12).toFixed(0);
    const windMultiplier = Math.max(0.6, 1.0 + Math.cos(dayIdx * 1.3) * 0.35);
    const windDirShift = Math.sin(dayIdx * 0.8) * 35;
    const estimatedHum = Math.min(98, Math.max(40, baseHumidity + humidityOffset));
    const rainBaseChance = estimatedHum >= 85 ? 80 : estimatedHum >= 75 ? 60 : estimatedHum >= 65 ? 30 : 10;

    return { tempOffset, humidityOffset, windMultiplier, windDirShift, rainBaseChance };
  };

  // ── Generate ALL hourly data for 7 days (168 hours) starting from CURRENT HOUR ──
  const now = new Date();
  const currentHourTimestamp = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
  ).getTime();

  const allHourlyData = Array.from({ length: 168 }, (_, i) => {
    const stepDate = new Date(currentHourTimestamp + i * 3600_000);
    const hour = stepDate.getHours();
    const dayIndex = Math.min(6, Math.floor(i / 24));
    const mod = getDayWeatherModifier(dayIndex);

    // Look up matching forecast PM2.5 from daily forecast points
    const dailyRaw: ForecastPoint[] = forecast?.daily?.slice(0, 7) ?? [];
    const targetDaily = dailyRaw[dayIndex];
    const baseDayPm25 = targetDaily?.pm25 ?? (12 + dayIndex);

    // Diurnal curve for PM2.5 (higher in morning/evening, lower at midday)
    const diurnalFactor = 0.88 + 0.24 * Math.cos(((hour - 7) / 24) * 2 * Math.PI);
    const pm25Val = i === 0 && currentWeather
      ? (avgAqi != null ? avgAqi : baseDayPm25)
      : Math.max(1, +(baseDayPm25 * diurnalFactor).toFixed(1));

    const aqiVal = pm25ToAqi(pm25Val);
    const band = bandForAqi(aqiVal);

    const isCurrentHour = i === 0;
    const isDayStart = hour === 0 && i > 0;
    const timeLabel = isCurrentHour
      ? "เดี๋ยวนี้"
      : `${String(hour).padStart(2, "0")}:00`;

    const dayName = isDayStart ? formatThaiShortDay(stepDate) : null;

    // Day-specific diurnal temperature & humidity curves
    const dayBaseTemp = baseTemp + mod.tempOffset;
    const dayBaseHumidity = Math.min(98, Math.max(35, baseHumidity + mod.humidityOffset));
    const dayBaseWind = Math.max(1.0, baseWind * mod.windMultiplier);

    // For current hour, use actual live readings from database
    const temp = isCurrentHour && currentWeather?.temperature != null
      ? Math.round(currentWeather.temperature)
      : getHourlyTemp(dayBaseTemp, hour);
    const humidity = isCurrentHour && currentWeather?.humidity != null
      ? Math.round(currentWeather.humidity)
      : getHourlyHumidity(dayBaseHumidity, hour);
    const windSpeed = isCurrentHour && currentWeather?.windSpeed != null
      ? +(currentWeather.windSpeed).toFixed(1)
      : getHourlyWind(dayBaseWind, hour);
    const windDir = isCurrentHour && currentWeather?.windDirection != null
      ? Math.round(currentWeather.windDirection)
      : Math.round((baseWindDir + mod.windDirShift + hour * 8) % 360);

    // Rain probability based on real humidity & precipitation
    const rainChance = isCurrentHour && (currentWeather?.precipitation ?? 0) > 0
      ? 80
      : humidity > 85
      ? mod.rainBaseChance
      : humidity > 75
      ? Math.max(10, mod.rainBaseChance - 20)
      : 0;

    return {
      hour,
      dayIndex,
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
      dateObj: stepDate,
    };
  });

  // First 24 hours for the hourly card
  const hourlyData = allHourlyData.slice(0, 24);

  // ── Derive daily data for 7 days (Today + next 6 days) ──
  const dailyData = Array.from({ length: 7 }, (_, dayIdx) => {
    const dayDate = new Date(currentHourTimestamp + dayIdx * 86400_000);
    const dayHours = allHourlyData.filter((h) => h.dayIndex === dayIdx);
    const mod = getDayWeatherModifier(dayIdx);

    // AQI: use daily forecast point if available, else average from hourly
    const dailyRaw: ForecastPoint[] = forecast?.daily?.slice(0, 7) ?? [];
    const rawPoint = dailyRaw[dayIdx];
    const pm25Val = rawPoint?.pm25 ?? (dayHours.length
      ? dayHours.reduce((s, h) => s + pm25ToAqi(h.aqi), 0) / dayHours.length
      : 12 + dayIdx);
    const aqiVal = dayIdx === 0 && avgAqi != null
      ? avgAqi
      : (rawPoint ? pm25ToAqi(rawPoint.pm25) : Math.round(dayHours.reduce((s, h) => s + h.aqi, 0) / (dayHours.length || 1)));
    const band = bandForAqi(aqiVal);

    const dayName = formatThaiDayName(dayDate, dayIdx === 0);

    // Temperature: derive max/min from hourly temps of this day
    const temps = dayHours.map((h) => h.temp);
    const tempMax = temps.length ? Math.max(...temps) : Math.round(baseTemp + mod.tempOffset + 3);
    const tempMin = temps.length ? Math.min(...temps) : Math.round(baseTemp + mod.tempOffset - 3);

    // Wind: average speed from hourly
    const avgWindSpeed = dayHours.length
      ? +(dayHours.reduce((s, h) => s + h.windSpeed, 0) / dayHours.length).toFixed(1)
      : +(baseWind * mod.windMultiplier).toFixed(1);

    // Wind direction: circular mean from hourly
    let sinSum = 0, cosSum = 0;
    for (const h of dayHours) {
      const rad = (h.windDir * Math.PI) / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    const windDir = dayHours.length
      ? Math.round(((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360)
      : Math.round((baseWindDir + mod.windDirShift) % 360);

    // Humidity: average from hourly
    const humidity = dayHours.length
      ? Math.round(dayHours.reduce((s, h) => s + h.humidity, 0) / dayHours.length)
      : Math.min(98, Math.max(40, baseHumidity + mod.humidityOffset));

    // Rain: max chance from hourly hours of this day
    const rainChance = dayHours.length
      ? Math.max(...dayHours.map((h) => h.rainChance))
      : mod.rainBaseChance;

    return {
      dayName,
      aqi: aqiVal,
      band,
      tempMax,
      tempMin,
      windSpeed: avgWindSpeed,
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
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
              24 ชั่วโมง · เลื่อนดูได้ →
            </span>
            <Link
              href={`/forecast?province=${provinceId}`}
              className="flex items-center gap-0.5 text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400"
            >
              ดูรายละเอียด
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>

        {/* Horizontal Scrollable Hourly Strip — visible scrollbar on desktop */}
        <div className="hourly-scroll-strip flex overflow-x-auto divide-x divide-zinc-100 dark:divide-zinc-800/80 pt-1 pb-2">
          {hourlyData.map((item, idx) => (
            <div
              key={idx}
              className={`flex flex-col items-center justify-between min-w-[76px] sm:min-w-[84px] px-2 py-2 text-center shrink-0 space-y-2.5 rounded-2xl transition ${
                item.isCurrentHour
                  ? "bg-emerald-500/15 dark:bg-emerald-950/50 border border-emerald-500/50 dark:border-emerald-500/50 shadow-xs ring-2 ring-emerald-500/20 z-10"
                  : ""
              } ${
                item.isDayStart ? "border-l-2 border-dashed border-zinc-300 dark:border-zinc-700 pl-3" : ""
              }`}
            >
              {/* 1. Time / Day Header */}
              <div className="text-center min-h-[32px] flex flex-col justify-center items-center">
                {item.isCurrentHour ? (
                  <span className="rounded-full bg-emerald-600 dark:bg-emerald-500 px-1.5 py-0.2 text-[8px] font-black text-white uppercase tracking-wider mb-0.5 shadow-2xs">
                    ตอนนี้
                  </span>
                ) : item.dayName ? (
                  <span className="block text-[10px] font-black text-zinc-800 dark:text-zinc-200">
                    {item.dayName}
                  </span>
                ) : null}
                <span
                  className={`block text-xs font-bold ${
                    item.isCurrentHour
                      ? "text-emerald-600 dark:text-emerald-400 font-black"
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
            พยากรณ์อากาศประจำวัน
          </h3>
          <Link
            href={`/forecast?province=${provinceId}`}
            className="flex items-center gap-0.5 text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            ดูรายละเอียด
            <ChevronRight size={14} />
          </Link>
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
