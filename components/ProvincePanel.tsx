"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ForecastLineChart, TrendLineChart } from "@/components/charts/intelligence-charts";
import { levelThai } from "@/lib/formatThai";
import type { ProvinceSnapshot } from "@/types/air";

function healthAdvice(pm25: number) {
  if (pm25 <= 25) return "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ";
  if (pm25 <= 50) return "กลุ่มเสี่ยงควรสังเกตอาการระคายเคือง";
  if (pm25 <= 75) return "ควรสวมหน้ากากเมื่ออยู่นอกอาคาร";
  if (pm25 <= 100) return "ควรลดกิจกรรมกลางแจ้งและปิดหน้าต่าง";
  return "ควรงดกิจกรรมกลางแจ้ง และสวมหน้ากาก N95";
}

type ProvincePanelProps = {
  selected: ProvinceSnapshot | null;
  timeline: number[];
  compareWith?: ProvinceSnapshot | null;
  onClose: () => void;
  onCompare: (slug: string) => void;
};

export function ProvincePanel({ selected, timeline, compareWith, onClose, onCompare }: ProvincePanelProps) {
  const forecast = timeline.slice(-3).map((value, i) => ({ day: i === 0 ? "พรุ่งนี้" : `อีก ${i + 1} วัน`, forecast: +(value * (1 + i * 0.03)).toFixed(1) }));

  return (
    <AnimatePresence>
      {selected && (
        <motion.aside initial={{ x: 420, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 420, opacity: 0 }} transition={{ type: "spring", stiffness: 180, damping: 22 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/30 bg-white/95 p-5 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/90">
          <button onClick={onClose} className="mb-3 rounded-lg border border-slate-300 p-2 dark:border-slate-700"><X size={16} /></button>
          <h2 className="text-2xl font-bold">{selected.province_name_th}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">อัปเดตล่าสุดในจังหวัด</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-900 p-3 text-slate-50">ค่าปัจจุบัน PM2.5 {selected.air.pm25.toFixed(1)}</div>
            <div className="rounded-xl bg-rose-600 p-3 text-white">ระดับ {levelThai(selected.air.pm25).label}</div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="mb-2 text-xs font-semibold">กราฟย้อนหลัง 7 วัน</p>
            <TrendLineChart data={timeline.map((pm25, index) => ({ day: `วัน-${6 - index}`, pm25 }))} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="mb-2 text-xs font-semibold">คาดการณ์ 3 วัน</p>
            <ForecastLineChart data={forecast} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 p-3 text-sm dark:border-slate-700/60">
            <p>สภาพอากาศ: ความชื้น {selected.weather.humidity}% · ความเร็วลม {selected.weather.wind} m/s · อุณหภูมิ {selected.weather.temp}°C</p>
          </div>

          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">คำแนะนำสุขภาพ: {healthAdvice(selected.air.pm25)}</p>
          <button onClick={() => onCompare(selected.slug)} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">เปรียบเทียบจังหวัด</button>

          {compareWith && compareWith.slug !== selected.slug && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
              <p className="font-semibold">เปรียบเทียบแบบเคียงข้าง</p>
              <p className="mt-2">{selected.province_name_th}: {selected.air.pm25.toFixed(1)} μg/m³</p>
              <p>{compareWith.province_name_th}: {compareWith.air.pm25.toFixed(1)} μg/m³</p>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
