"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { generateMockAirQualityData } from "@/lib/mock/air-quality";
import { getAQIBgClass, getAQICategory, getAQITextClass } from "@/lib/aqi/calculate";
import { type ThaiRegion } from "@/lib/provinces";

const regions: (ThaiRegion | "all")[] = ["all", "north", "northeast", "central", "east", "west", "south", "bangkok-metropolitan"];

export function ProvinceDirectory() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<(typeof regions)[number]>("all");
  const [loading] = useState(false);

  const rows = useMemo(() => generateMockAirQualityData(), []);

  const regionStats = useMemo(() => {
    const stats = regions.filter((r) => r !== "all").map((r) => {
      const scoped = rows.filter((x) => x.province.region === r);
      return {
        region: r,
        count: scoped.length,
        avgAQI: scoped.length ? Math.round(scoped.reduce((sum, x) => sum + x.aqi, 0) / scoped.length) : 0,
      };
    });
    return stats;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((item) => {
        const matchQuery = !query || item.province.thaiName.includes(query) || item.province.englishName.toLowerCase().includes(query.toLowerCase());
        const matchRegion = region === "all" || item.province.region === region;
        return matchQuery && matchRegion;
      })
      .sort((a, b) => a.province.thaiName.localeCompare(b.province.thaiName, "th"));
  }, [rows, query, region]);

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-semibold">สารบบจังหวัด (77 จังหวัด)</h2>
        <p className="mt-1 text-sm text-slate-500">ค้นหาและเปรียบเทียบสถานการณ์อากาศรายจังหวัดด้วยข้อมูลจำลองเพื่อเดโม</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาจังหวัด (ไทย/English)" className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900 sm:col-span-2" />
          <select value={region} onChange={(e) => setRegion(e.target.value as (typeof regions)[number])} className="rounded-xl border bg-white/80 px-3 py-2 text-sm dark:bg-slate-900">
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {regionStats.map((stat) => (
          <Card key={stat.region} className="text-sm">
            <p className="font-semibold">{stat.region}</p>
            <p className="text-slate-500">จังหวัด: {stat.count}</p>
            <p className="text-slate-500">AQI เฉลี่ย: {stat.avgAQI}</p>
          </Card>
        ))}
      </div>

      {loading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <Card key={i} className="h-36 animate-pulse" />)}</div>}

      {!loading && filtered.length === 0 && <Card className="text-center text-slate-500">ไม่พบจังหวัดตามคำค้นหา/ตัวกรองที่เลือก</Card>}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item, idx) => (
            <motion.div key={item.province.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.01 }}>
              <Link href={`/province/${item.province.id}`}>
                <Card className="space-y-2 hover:-translate-y-0.5 hover:shadow-xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{item.province.thaiName}</h3>
                      <p className="text-xs text-slate-500">{item.province.englishName}</p>
                      <p className="text-xs text-slate-400">{item.province.region}</p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Demo Data</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p>AQI: <b>{item.aqi}</b></p>
                    <p>PM2.5: <b>{item.pm25}</b></p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2 py-1 ${getAQIBgClass(item.aqi)} ${getAQITextClass(item.aqi)}`}>{getAQICategory(item.aqi).thaiLabel}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">source: {item.source}</span>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
