"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProvinceRankingChart, ForecastTrendChart } from "@/components/dashboard/charts";
import { ThailandHeatMap } from "@/components/dashboard/heatmap";
import { Card } from "@/components/ui/card";
import { buildThailandSnapshot } from "@/lib/engine";
import { cache } from "@/lib/cache";
import type { ProvinceSnapshot } from "@/types/air";

export default function DashboardPage() {
  const [data, setData] = useState<ProvinceSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    setData(cache.getSnapshot());
    const load = async () => {
      const next = await buildThailandSnapshot();
      setData(next);
      setUpdatedAt(new Date().toLocaleString());
    };

    load();
    const airTimer = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(airTimer);
  }, []);

  const filtered = useMemo(
    () => data.filter((p) => p.province_name_en.toLowerCase().includes(query.toLowerCase())),
    [data, query],
  );

  const ranking = useMemo(() => [...filtered].sort((a, b) => b.air.pm25 - a.air.pm25), [filtered]);
  const best = ranking.at(-1);
  const worst = ranking[0];
  const predictedTop = [...ranking].sort((a, b) => b.predicted_pm25 - a.predicted_pm25).slice(0, 5);

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">Thailand National Air Intelligence Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-slate-500">Provinces covered</p><p className="text-2xl font-bold">{data.length}/77</p></Card>
        <Card><p className="text-xs text-slate-500">Worst air today</p><p className="font-semibold">{worst?.province_name_en ?? "-"}</p></Card>
        <Card><p className="text-xs text-slate-500">Best air today</p><p className="font-semibold">{best?.province_name_en ?? "-"}</p></Card>
        <Card><p className="text-xs text-slate-500">Last update</p><p className="text-sm">{updatedAt || "Loading..."}</p></Card>
      </div>

      <Card>
        <input className="w-full rounded-lg border border-slate-300 p-2" placeholder="Search 77 provinces..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Thailand AQ Heat Map (All 77 provinces)</h2>
        <ThailandHeatMap rows={ranking} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Worst PM2.5 Ranking</h2><ProvinceRankingChart rows={ranking} /></Card>
        <Card><h2 className="mb-2 font-semibold">Forecast Trend (current vs tomorrow)</h2><ForecastTrendChart rows={ranking} /></Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Predicted top polluted provinces tomorrow</h2>
        <ul className="space-y-2 text-sm">
          {predictedTop.map((item, i) => (
            <li key={item.slug} className="flex items-center justify-between border-b pb-2">
              <span>{i + 1}. {item.province_name_en}</span>
              <span>{item.predicted_pm25} μg/m³ ({item.risk_level})</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Province directory</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranking.map((p) => (
            <Link key={p.slug} className="rounded-lg border p-2 hover:bg-slate-50 dark:hover:bg-slate-900" href={`/province/${p.slug}`}>
              <p className="font-medium">{p.province_name_en}</p>
              <p className="text-xs text-slate-500">{p.province_name_th} • {p.region}</p>
              <p className="text-sm">PM2.5 {p.air.pm25} | Risk {p.risk_level}</p>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
