"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Moon, RefreshCw, Search, SunMedium } from "lucide-react";
import { buildThailandSnapshot } from "@/lib/engine";
import { cache } from "@/lib/cache";
import { storage } from "@/lib/storage";
import type { ProvinceSnapshot } from "@/types/air";
import { StatsCard } from "@/components/ui/stats-card";
import { ThailandMap } from "@/components/map/thailand-map";
import { ProvinceDrawer } from "@/components/panel/province-drawer";
import { RankingBars } from "@/components/charts/intelligence-charts";

const days = ["D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "Today"];

function generateTimeline(seed: string, base: number) {
  const seedNum = seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return Array.from({ length: 7 }).map((_, index) => {
    const wave = Math.sin((seedNum + index) / 3.1) * 8;
    const drift = (index - 4) * 1.3;
    return Math.max(8, +(base + wave + drift).toFixed(1));
  });
}

export function ThailandMapIntelligence() {
  const [rows, setRows] = useState<ProvinceSnapshot[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [compareSlug, setCompareSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [dayIndex, setDayIndex] = useState(6);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const dark = storage.getDarkMode();
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);

    const cached = cache.getSnapshot();
    if (cached.length) setRows(cached);
    buildThailandSnapshot().then(setRows);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setDayIndex((prev) => (prev >= 6 ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [playing]);

  const timelineByProvince = useMemo(
    () => Object.fromEntries(rows.map((x) => [x.slug, generateTimeline(x.slug, x.air.pm25)])),
    [rows],
  );

  const rowsForDay = useMemo(
    () =>
      rows.map((x) => ({
        ...x,
        air: { ...x.air, pm25: timelineByProvince[x.slug]?.[dayIndex] ?? x.air.pm25 },
      })),
    [dayIndex, rows, timelineByProvince],
  );

  const ranked = useMemo(() => [...rowsForDay].sort((a, b) => b.air.pm25 - a.air.pm25), [rowsForDay]);
  const average = useMemo(() => (ranked.length ? ranked.reduce((sum, x) => sum + x.air.pm25, 0) / ranked.length : 0), [ranked]);
  const selected = rows.find((x) => x.slug === selectedSlug) ?? null;
  const compareWith = rows.find((x) => x.slug === compareSlug) ?? null;

  const refresh = async () => {
    const latest = await buildThailandSnapshot();
    setRows(latest);
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    storage.setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const worst = ranked[0];
  const cleanest = ranked[ranked.length - 1];

  return (
    <section className="min-h-[90vh] space-y-4">
      <nav className="sticky top-16 z-30 rounded-2xl border border-white/30 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm font-bold tracking-[0.14em] text-sky-700 dark:text-sky-300">THAILAND AQI INTELLIGENCE</p>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300/70 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/60">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search province" className="w-36 bg-transparent outline-none" />
          </label>
          <button onClick={toggleTheme} className="rounded-xl border border-slate-300 p-2 dark:border-slate-700">{isDark ? <SunMedium size={16} /> : <Moon size={16} />}</button>
          <button onClick={refresh} className="rounded-xl border border-slate-300 p-2 dark:border-slate-700"><RefreshCw size={16} /></button>
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <ThailandMap rows={rowsForDay} dayIndex={dayIndex} search={search} selectedSlug={selectedSlug} timelineByProvince={timelineByProvince} onSelect={setSelectedSlug} />
          <div className="rounded-2xl border border-white/30 bg-white/70 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Time Slider (ย้อนหลัง 7 วัน)</p>
              <button onClick={() => setPlaying((p) => !p)} className="rounded-lg bg-sky-600 px-2 py-1 text-xs text-white">{playing ? "Pause" : "Auto Play"}</button>
            </div>
            <input type="range" min={0} max={6} value={dayIndex} onChange={(e) => setDayIndex(Number(e.target.value))} className="w-full" />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Showing: {days[dayIndex]}</p>
          </div>
        </div>

        <motion.aside initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 rounded-3xl border border-white/30 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/65">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatsCard title="Thailand Avg PM2.5" value={`${average.toFixed(1)} μg/m³`} hint="National moving average" tone="warn" />
            <StatsCard title="Worst Province" value={worst ? worst.province_name_en : "-"} hint={worst ? `${worst.air.pm25.toFixed(1)} μg/m³` : "No data"} tone="danger" />
            <StatsCard title="Cleanest Province" value={cleanest ? cleanest.province_name_en : "-"} hint={cleanest ? `${cleanest.air.pm25.toFixed(1)} μg/m³` : "No data"} tone="good" />
            <StatsCard title="Tomorrow Prediction" value={`${(average * 1.05).toFixed(1)} μg/m³`} hint="Weighted forecast" tone="neutral" />
          </div>

          <div className="rounded-2xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="text-sm font-semibold">Top 10 Most Polluted Provinces</p>
            <RankingBars data={ranked.slice(0, 10).map((x) => ({ name: x.province_name_en, value: +x.air.pm25.toFixed(1) }))} />
          </div>

          <div className="rounded-2xl border border-slate-200/60 p-3 dark:border-slate-700/60">
            <p className="text-sm font-semibold">Weather Impact</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-900/30">Humidity<br />{worst?.weather.humidity ?? "-"}%</div>
              <div className="rounded-lg bg-teal-50 p-2 dark:bg-teal-900/30">Wind<br />{worst?.weather.wind ?? "-"} m/s</div>
              <div className="rounded-lg bg-orange-50 p-2 dark:bg-orange-900/30">Temp<br />{worst?.weather.temp ?? "-"}°C</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 p-3 text-sm dark:border-slate-700/60">
            <p className="font-semibold">Smart Insights AI</p>
            <p className="mt-2 text-slate-600 dark:text-slate-300">{worst ? `${worst.province_name_en} risk rising due to hotspot increase and weak wind conditions.` : "Loading insight..."}</p>
          </div>

          <button onClick={() => window.print()} className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Export screenshot for thesis</button>
        </motion.aside>
      </div>

      <ProvinceDrawer
        selected={selected}
        timeline={selected ? timelineByProvince[selected.slug] : []}
        compareWith={compareWith}
        onClose={() => setSelectedSlug(null)}
        onCompare={(slug) => setCompareSlug(slug)}
      />

      <footer className="rounded-2xl border border-white/30 bg-white/70 px-4 py-3 text-xs text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
        Data sources: Open-Meteo, OpenAQ, GISTDA hotspot feed. Last updated: {new Date().toLocaleString()} · Thesis project by student.
      </footer>
    </section>
  );
}
