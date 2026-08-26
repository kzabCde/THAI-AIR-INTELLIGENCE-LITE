"use client";

import { useState, useEffect } from "react";
import { Activity, Users, ShieldAlert, DoorClosed, Leaf } from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
import type { ProvinceForecast, ForecastPoint } from "@/services/types";

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

function formatTimeString(d: Date): string {
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
}

function findTimeWindow(
  hourly: ForecastPoint[],
  mode: "min" | "max",
  windowHours: number = 3,
): { startTime: string; endTime: string; minPm: number; maxPm: number } | null {
  if (!hourly.length) return null;
  let bestScore = mode === "min" ? Infinity : -Infinity;
  let bestIdx = 0;
  for (let i = 0; i <= hourly.length - windowHours; i++) {
    const slice = hourly.slice(i, i + windowHours);
    const avg = slice.reduce((s, p) => s + p.pm25, 0) / slice.length;
    if (mode === "min" ? avg < bestScore : avg > bestScore) {
      bestScore = avg;
      bestIdx = i;
    }
  }
  const slice = hourly.slice(bestIdx, bestIdx + windowHours);
  const startD = new Date(slice[0].t);
  const endD = new Date(slice[slice.length - 1].t);
  endD.setHours(endD.getHours() + 1);
  return {
    startTime: formatTimeString(startD),
    endTime: formatTimeString(endD),
    minPm: Math.round(Math.min(...slice.map((p) => p.pm25))),
    maxPm: Math.round(Math.max(...slice.map((p) => p.pm25))),
  };
}

export function HealthAdviceGrid({
  pm25 = 0,
  aqi = 0,
  provinceId = "TH-40",
}: {
  pm25?: number;
  aqi?: number;
  provinceId?: string;
}) {
  const [activeTab, setActiveTab] = useState<"advice" | "window">("advice");
  const [forecast, setForecast] = useState<ProvinceForecast | null>(null);

  useEffect(() => {
    fetch(`/api/forecast?province=${provinceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        if (data && Array.isArray(data.hourly)) {
          setForecast(data);
        }
      })
      .catch(() => {});
  }, [provinceId]);

  const band = aqi ? bandForAqi(aqi) : bandForPm25(pm25);
  const items = getAdviceItems(aqi);

  const hourly24 = forecast?.hourly?.slice(0, 24) ?? [];
  const rawBestWindow = hourly24.length ? findTimeWindow(hourly24, "min", 3) : null;
  const rawRiskWindow = hourly24.length ? findTimeWindow(hourly24, "max", 4) : null;

  const bestWindow = rawBestWindow ?? { startTime: "07:30", endTime: "10:30", minPm: 5, maxPm: 12 };
  const riskWindow = rawRiskWindow && rawRiskWindow.maxPm > 37.5 ? rawRiskWindow : null;

  return (
    <div className="space-y-2.5">
      {/* Tab Switcher Bar */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-xl bg-zinc-100 dark:bg-zinc-800 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("advice")}
            className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
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
            className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
              activeTab === "window"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            ช่วงเวลาแนะนำวันนี้
          </button>
        </div>

        <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 hidden sm:inline">
          {activeTab === "advice"
            ? `ประเมินตาม AQI ${aqi} (${band.labelTh})`
            : "ประเมินตามพยากรณ์ 24 ชม."}
        </span>
      </div>

      {/* Card Content */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-3.5 sm:p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        {activeTab === "advice" ? (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: `${item.color}12`,
                      border: `1.5px solid ${item.color}25`,
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                      {item.title}
                    </p>
                    <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`grid ${bestWindow && riskWindow ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"} gap-3`}>
              {/* อากาศดีที่สุด */}
              <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-3 sm:p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    <Leaf className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>อากาศดีที่สุด</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1 leading-tight">
                    {bestWindow.startTime} - {bestWindow.endTime}
                  </p>
                </div>
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                  เหมาะสำหรับกิจกรรมกลางแจ้ง ออกกำลังกาย
                </p>
              </div>

              {/* ช่วงเวลาควรระวัง (ถ้ามี) */}
              {riskWindow && (
                <div className="rounded-xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 p-3 sm:p-3.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-600 dark:text-orange-400">
                      <ShieldAlert className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      <span>ช่วงเวลาควรระวัง</span>
                    </div>
                    <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white mt-1 leading-tight">
                      {riskWindow.startTime} - {riskWindow.endTime}
                    </p>
                  </div>
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                    ควรหลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
