"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  Users,
  ShieldAlert,
  DoorClosed,
  Leaf,
  Wind,
} from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import { computeHourlyForecastStrip } from "@/lib/forecast-weather";
import type { ProvinceForecast } from "@/services/types";

export interface CurrentWeatherInfo {
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  precipitation?: number | null;
  precipitation24h?: number | null;
}

type AdviceItem = {
  title: string;
  desc: string;
  color: string;
  icon: typeof Activity;
};

function getAdviceItems(aqi: number): AdviceItem[] {
  if (aqi > 150) {
    return [
      { icon: Activity, title: "คนทั่วไป", desc: "งดกิจกรรมกลางแจ้ง สวมหน้ากาก N95 ทุกครั้งที่ออกนอกอาคาร", color: "#e11d48" },
      { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "งดให้อยู่นอกอาคาร ใช้เครื่องฟอกอากาศในห้อง", color: "#e11d48" },
      { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "ต้องสวมหน้ากาก N95 ทุกครั้งที่ออกนอกอาคาร", color: "#e11d48" },
      { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "ไม่แนะนำ ปิดมิดชิดตลอดเวลา", color: "#e11d48" },
    ];
  }
  if (aqi > 100) {
    return [
      { icon: Activity, title: "คนทั่วไป", desc: "หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากากเมื่อออกนอกอาคาร", color: "#ea580c" },
      { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "หลีกเลี่ยงกิจกรรมกลางแจ้ง แนะนำสวมหน้ากาก N95", color: "#ea580c" },
      { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "แนะนำให้สวมหน้ากาก N95 เมื่ออยู่กลางแจ้ง", color: "#ea580c" },
      { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "ไม่แนะนำ ลดการเปิดหน้าต่างให้มากที่สุด", color: "#ea580c" },
    ];
  }
  if (aqi > 50) {
    return [
      { icon: Activity, title: "คนทั่วไป", desc: "สามารถทำกิจกรรมกลางแจ้งได้ แต่ควรลดเวลาลงบ้าง", color: "#ca8a04" },
      { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "ลดกิจกรรมกลางแจ้ง แนะนำสวมหน้ากาก", color: "#ca8a04" },
      { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "แนะนำให้สวมหน้ากากเมื่ออยู่กลางแจ้งเป็นเวลานาน", color: "#ca8a04" },
      { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "ลดการเปิดหน้าต่าง เลี่ยงช่วงฝุ่นสูง", color: "#ca8a04" },
    ];
  }
  return [
    { icon: Activity, title: "คนทั่วไป", desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ", color: "#16a34a" },
    { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ", color: "#16a34a" },
    { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "ไม่จำเป็นต้องสวมหน้ากาก N95", color: "#16a34a" },
    { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "สามารถเปิดให้อากาศถ่ายเทได้ตามปกติ", color: "#16a34a" },
  ];
}

export function HealthAdviceGrid({
  pm25 = 0,
  aqi = 0,
  provinceId = "TH-40",
  currentWeather,
}: {
  pm25?: number;
  aqi?: number;
  provinceId?: string;
  currentWeather?: CurrentWeatherInfo;
}) {
  const [activeTab, setActiveTab] = useState<"advice" | "window">("advice");
  const [forecast, setForecast] = useState<ProvinceForecast | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/forecast?province=${provinceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        if (isMounted && data && Array.isArray(data.daily)) {
          setForecast(data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [provinceId]);

  const band = aqi ? bandForAqi(aqi) : bandForPm25(pm25);
  const items = getAdviceItems(aqi);

  const baseTemp = currentWeather?.temperature ?? 28;
  const baseHumidity = currentWeather?.humidity ?? 70;
  const baseWind = currentWeather?.windSpeed ?? 5.0;
  const baseWindDir = currentWeather?.windDirection ?? 180;
  const basePrecip = currentWeather?.precipitation ?? currentWeather?.precipitation24h ?? 0;

  // ── Dynamic 24h Hourly Forecast Strip ──
  const now = new Date();
  const currentHourTimestamp = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
  ).getTime();

  const hourlyStrip = computeHourlyForecastStrip({
    currentHourTimestamp,
    hoursCount: 24,
    livePm25: forecast?.current ?? (pm25 > 0 ? pm25 : null),
    dailyForecast: forecast?.daily,
    baseTemp,
    baseHumidity,
    baseWind,
    baseWindDir,
    precipitation: basePrecip,
  });

  // ── Best Time Window (Lowest 3h PM2.5) ──
  let minAvg = Infinity;
  let bestStartIdx = 0;
  for (let i = 0; i <= hourlyStrip.length - 3; i++) {
    const slice = hourlyStrip.slice(i, i + 3);
    const avg = slice.reduce((s, it) => s + it.pm25, 0) / 3;
    if (avg < minAvg) {
      minAvg = avg;
      bestStartIdx = i;
    }
  }
  const bestSlice = hourlyStrip.slice(bestStartIdx, bestStartIdx + 3);
  const bestStartHour = bestSlice[0]?.hour ?? 7;
  const bestEndHour = ((bestSlice[bestSlice.length - 1]?.hour ?? 9) + 1) % 24;
  const bestWindow = {
    startTime: `${String(bestStartHour).padStart(2, "0")}:00`,
    endTime: `${String(bestEndHour).padStart(2, "0")}:00`,
    minPm: bestSlice.length ? Math.round(Math.min(...bestSlice.map((it) => it.pm25))) : 5,
    maxPm: bestSlice.length ? Math.round(Math.max(...bestSlice.map((it) => it.pm25))) : 12,
  };

  // ── Risk Time Window (Highest 4h PM2.5 > 37.5) ──
  let maxAvg = -Infinity;
  let riskStartIdx = 0;
  for (let i = 0; i <= hourlyStrip.length - 4; i++) {
    const slice = hourlyStrip.slice(i, i + 4);
    const avg = slice.reduce((s, it) => s + it.pm25, 0) / 4;
    if (avg > maxAvg) {
      maxAvg = avg;
      riskStartIdx = i;
    }
  }
  const riskSlice = hourlyStrip.slice(riskStartIdx, riskStartIdx + 4);
  const maxPmInRisk = riskSlice.length ? Math.max(...riskSlice.map((it) => it.pm25)) : 0;
  const riskWindow = maxPmInRisk > 37.5 && riskSlice.length
    ? {
        startTime: `${String(riskSlice[0].hour).padStart(2, "0")}:00`,
        endTime: `${String((riskSlice[riskSlice.length - 1].hour + 1) % 24).padStart(2, "0")}:00`,
        maxPm: Math.round(maxPmInRisk),
      }
    : null;

  return (
    <div className="space-y-2.5">
      {/* ── Tab Switcher Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("advice")}
            className={`rounded-lg px-2.5 sm:px-3 py-1 text-xs font-bold transition ${
              activeTab === "advice"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            คำแนะนำสุขภาพ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("window")}
            className={`rounded-lg px-2.5 sm:px-3 py-1 text-xs font-bold transition ${
              activeTab === "window"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            ช่วงเวลาแนะนำ
          </button>
        </div>

        <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 hidden sm:inline">
          {activeTab === "advice"
            ? `ประเมินตาม AQI ${aqi} (${band.labelTh})`
            : "ประเมินตามพยากรณ์ 24 ชม."}
        </span>
      </div>

      {/* ── Tab Content Container (Ultra-Compact) ── */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-2.5 sm:p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        {/* Tab 1: คำแนะนำสุขภาพ */}
        {activeTab === "advice" && (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-2.5">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: `${item.color}12`,
                      border: `1.5px solid ${item.color}25`,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {item.title}
                    </p>
                    <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: ช่วงเวลาแนะนำสำหรับวันนี้ */}
        {activeTab === "window" && (
          <div className="space-y-2">
            <div className={`grid ${bestWindow && riskWindow ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-2 sm:gap-2.5`}>
              {/* กล่องเขียว: อากาศดีที่สุด */}
              <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2.5 sm:p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">
                    <Leaf className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>อากาศดีที่สุด</span>
                  </div>
                  <p className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5 leading-tight">
                    {bestWindow.startTime} - {bestWindow.endTime} น.
                  </p>
                </div>
                <p className="text-[10px] sm:text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                  เหมาะสำหรับกิจกรรมกลางแจ้ง ออกกำลังกาย และเปิดหน้าต่างระบายอากาศ
                </p>
              </div>

              {/* กล่องส้ม: ช่วงเวลาควรระวัง (ถ้ามี) */}
              {riskWindow && (
                <div className="rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 p-2.5 sm:p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-orange-600 dark:text-orange-400">
                      <ShieldAlert className="h-3 w-3 text-orange-500 shrink-0" />
                      <span>ช่วงเวลาควรระวัง</span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-zinc-900 dark:text-white mt-0.5 leading-tight">
                      {riskWindow.startTime} - {riskWindow.endTime} น.
                    </p>
                  </div>
                  <p className="text-[10px] sm:text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
                    ควรหลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน และสวมหน้ากากเมื่อออกนอกอาคาร
                  </p>
                </div>
              )}
            </div>

            {/* Quick Tip Bar */}
            <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Wind className="h-3 w-3 text-teal-500" />
                <span>การระบายอากาศที่แนะนำ: ช่วง {bestWindow.startTime} - {bestWindow.endTime} น.</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
