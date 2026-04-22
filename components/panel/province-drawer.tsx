"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ProvinceSnapshot } from "@/types/air";
import { ForecastLineChart, RiskRadar, TrendLineChart } from "@/components/charts/intelligence-charts";

function healthAdvice(pm25: number) {
  if (pm25 <= 25) return "Air quality is healthy. Outdoor activity is safe for all groups.";
  if (pm25 <= 50) return "Acceptable air. Sensitive groups should monitor symptoms.";
  if (pm25 <= 75) return "Wear a mask outdoors and reduce prolonged exercise.";
  if (pm25 <= 100) return "Avoid strenuous outdoor activity and keep windows closed.";
  return "High risk. Use N95 masks, air purifier, and avoid outdoor exposure.";
}

type ProvinceDrawerProps = {
  selected: ProvinceSnapshot | null;
  timeline: number[];
  compareWith?: ProvinceSnapshot | null;
  onClose: () => void;
  onCompare: (slug: string) => void;
};

export function ProvinceDrawer({ selected, timeline, compareWith, onClose, onCompare }: ProvinceDrawerProps) {
  const forecast = timeline.slice(-3).map((value, i) => ({
    day: i === 0 ? "Tomorrow" : `D+${i + 1}`,
    forecast: +(value * (1 + i * 0.03)).toFixed(1),
  }));

  return (
    <AnimatePresence>
      {selected && (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
          className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/30 bg-white/80 p-5 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/85"
        >
          <button onClick={onClose} className="mb-3 rounded-lg border border-slate-300 p-2 dark:border-slate-700">
            <X size={16} />
          </button>
          <h2 className="text-2xl font-bold">{selected.province_name_en}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{selected.province_name_th}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-900 p-3 text-slate-50 dark:bg-slate-800">PM2.5 {selected.air.pm25.toFixed(1)}</div>
            <div className="rounded-xl bg-rose-600 p-3 text-white">AQI {selected.air.aqi}</div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="mb-2 text-xs font-semibold uppercase">PM2.5 Trend (ย้อนหลัง 7 วัน)</p>
            <TrendLineChart data={timeline.map((pm25, index) => ({ day: `D-${6 - index}`, pm25 }))} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="mb-2 text-xs font-semibold uppercase">Tomorrow Forecast</p>
            <ForecastLineChart data={forecast} />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="mb-2 text-xs font-semibold uppercase">Risk Radar</p>
            <RiskRadar
              value={[
                { metric: "PM2.5", score: Math.min(100, selected.air.pm25) },
                { metric: "Hotspot", score: Math.min(100, selected.hotspot_count * 12) },
                { metric: "Humidity", score: selected.weather.humidity },
                { metric: "Wind", score: 100 - Math.min(100, selected.weather.wind * 10) },
              ]}
            />
          </div>

          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{healthAdvice(selected.air.pm25)}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Nearby stations: {selected.nearby_stations.join(", ")}</p>
          <button onClick={() => onCompare(selected.slug)} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Compare Province
          </button>

          {compareWith && compareWith.slug !== selected.slug && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-semibold uppercase">Side-by-side</p>
              <p className="mt-2 text-sm">{selected.province_name_en}: {selected.air.pm25.toFixed(1)} μg/m³</p>
              <p className="text-sm">{compareWith.province_name_en}: {compareWith.air.pm25.toFixed(1)} μg/m³</p>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
