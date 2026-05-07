"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { generateMockAirQualityData } from "@/lib/mock/air-quality";
import { formatAQI, getAQIBgClass, getAQICategory, getAQITextClass } from "@/lib/aqi/calculate";
import { calculateRisk } from "@/lib/risk/calculate-risk";
import { type ThaiRegion } from "@/lib/provinces";

const regions: (ThaiRegion | "all")[] = ["all", "north", "northeast", "central", "east", "west", "south", "bangkok-metropolitan"];
const categories = ["all", "Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Very Unhealthy", "Hazardous"] as const;
const sorts = ["aqi-high", "aqi-low", "pm25-high", "name"] as const;

export function NationalDashboard() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<(typeof regions)[number]>("all");
  const [category, setCategory] = useState<(typeof categories)[number]>("all");
  const [sort, setSort] = useState<(typeof sorts)[number]>("aqi-high");
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  const rows = useMemo(() => generateMockAirQualityData().map((row) => ({
    ...row,
    risk: calculateRisk({ pm25: row.pm25, pm10: row.pm10, aqi: row.aqi, windSpeed: 8, humidity: 70, temperature: 33, isStale: row.isStale }),
  })), []);

  const filtered = useMemo(() => {
    let list = rows.filter((item) => {
      const matchQuery = !query || item.province.thaiName.includes(query) || item.province.englishName.toLowerCase().includes(query.toLowerCase());
      const matchRegion = region === "all" || item.province.region === region;
      const matchCategory = category === "all" || item.aqiCategory === category;
      return matchQuery && matchRegion && matchCategory;
    });

    list = list.sort((a, b) => {
      if (sort === "aqi-high") return b.aqi - a.aqi;
      if (sort === "aqi-low") return a.aqi - b.aqi;
      if (sort === "pm25-high") return b.pm25 - a.pm25;
      return a.province.thaiName.localeCompare(b.province.thaiName, "th");
    });

    return list;
  }, [rows, query, region, category, sort]);

  const summary = useMemo(() => {
    const avgAQI = Math.round(rows.reduce((sum, p) => sum + p.aqi, 0) / rows.length);
    const avgPM25 = Number((rows.reduce((sum, p) => sum + p.pm25, 0) / rows.length).toFixed(1));
    const worst = [...rows].sort((a, b) => b.aqi - a.aqi)[0];
    const best = [...rows].sort((a, b) => a.aqi - b.aqi)[0];
    const riskCount = rows.filter((p) => p.risk.riskScore > 60).length;
    return { avgAQI, avgPM25, worst, best, riskCount };
  }, [rows]);

  const hasStale = rows.some((row) => row.isStale);

  return (
    <div className="space-y-5">
      {hasStale && <div className="rounded-xl border border-amber-300 bg-amber-100/80 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">มีข้อมูลบางส่วนที่อาจไม่ล่าสุด (Stale Data)</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[`ค่า AQI เฉลี่ยประเทศ: ${summary.avgAQI}`, `ค่า PM2.5 เฉลี่ย: ${summary.avgPM25}`, `จังหวัดที่อากาศแย่ที่สุด: ${summary.worst.province.thaiName}`, `จังหวัดที่อากาศดีที่สุด: ${summary.best.province.thaiName}`, `จำนวนจังหวัดระดับเสี่ยง: ${summary.riskCount}`].map((item) => <Card key={item} className="text-sm font-medium">{item}</Card>)}
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อจังหวัด (ไทย/อังกฤษ)" className="w-full rounded-xl border bg-white/80 py-2 pl-9 pr-3 text-sm dark:bg-slate-900" /></label>
          <select value={region} onChange={(e) => setRegion(e.target.value as (typeof regions)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900">{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <select value={category} onChange={(e) => setCategory(e.target.value as (typeof categories)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900">{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value as (typeof sorts)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900 md:col-span-4">{sorts.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
      </Card>

      <div className="flex items-center gap-2 text-xs"><span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Demo Data</span><span className="text-slate-500">Mock data only — no real-time API</span></div>

      {loading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-40 animate-pulse" />)}</div>}
      {error && <Card className="flex items-center gap-2 text-rose-600"><AlertCircle className="h-4 w-4" /> {error}</Card>}
      {!loading && !error && filtered.length === 0 && <Card className="text-center text-slate-500">ไม่พบข้อมูลตามตัวกรองที่เลือก</Card>}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, i) => (
            <motion.div key={item.province.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.01 }}>
              <Link href={`/province/${item.province.id}`}>
                <Card className="space-y-2 hover:-translate-y-0.5 hover:shadow-xl">
                  <div className="flex items-start justify-between"><div><h3 className="font-semibold">{item.province.thaiName}</h3><p className="text-xs text-slate-500">{item.province.englishName} • {item.province.region}</p></div><span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Demo Data</span></div>
                  <div className="grid grid-cols-3 gap-2 text-sm"><div>PM2.5 <b>{item.pm25}</b></div><div>PM10 <b>{item.pm10}</b></div><div>AQI <b>{formatAQI(item.aqi)}</b></div></div>
                  <div className="flex items-center justify-between text-xs"><span className={`rounded-full px-2 py-1 ${getAQIBgClass(item.aqi)} ${getAQITextClass(item.aqi)}`}>{item.aqiCategory} • {item.risk.thaiLabel}</span><span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">source: {item.source}</span></div>
                  <p className="text-xs text-slate-400">updated: {new Date(item.updatedAt).toLocaleTimeString("th-TH")}</p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
