"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { PmChart } from "@/components/pm-chart";
import { fetchThaiAirData, aqiLabel } from "@/lib/air";
import { storage } from "@/lib/storage";
import type { ProvinceAir } from "@/types/air";

export default function DashboardPage() {
  const [data, setData] = useState<ProvinceAir[]>([]);
  const [query, setQuery] = useState("");
  const [favorite, setFavorite] = useState("");

  useEffect(() => {
    fetchThaiAirData().then(setData);
    setFavorite(storage.getFavorite());
  }, []);

  const filtered = useMemo(
    () => data.filter((d) => d.province.toLowerCase().includes(query.toLowerCase())),
    [data, query],
  );

  const summary = useMemo(() => {
    if (!data.length) return null;
    const sorted = [...data].sort((a, b) => a.pm25 - b.pm25);
    const avg = data.reduce((sum, d) => sum + d.pm25, 0) / data.length;
    return {
      avg: avg.toFixed(1),
      cleanest: sorted[0],
      worst: sorted[sorted.length - 1],
      updated: new Date(data[0].fetchedAt).toLocaleString(),
      source: data[0].source,
    };
  }, [data]);

  const ranking = [...filtered].sort((a, b) => b.pm25 - a.pm25);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Thailand PM2.5 Dashboard</h1>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><p className="text-xs text-slate-500">National Average PM2.5</p><p className="text-2xl font-bold">{summary.avg}</p></Card>
          <Card><p className="text-xs text-slate-500">Cleanest Province</p><p className="text-xl font-semibold">{summary.cleanest.province}</p></Card>
          <Card><p className="text-xs text-slate-500">Worst Province</p><p className="text-xl font-semibold">{summary.worst.province}</p></Card>
          <Card><p className="text-xs text-slate-500">Last Updated</p><p className="text-sm">{summary.updated}</p><p className="text-xs text-slate-500">Source: {summary.source}</p></Card>
        </div>
      )}

      <Card>
        <input
          className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none"
          placeholder="Search province..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3" id="map">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Province Cards</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((item) => (
              <Link key={item.slug} href={`/province/${item.slug}`}>
                <div className="rounded-xl border border-slate-200 p-3 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700">
                  <p className="font-semibold">{item.province} {favorite === item.slug && "★"}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">PM2.5: {item.pm25} μg/m³</p>
                  <p className="text-xs text-slate-500">{aqiLabel(item.pm25)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Ranking</h2>
          <ol className="space-y-2 text-sm">
            {ranking.map((item, i) => (
              <li key={item.slug} className="flex justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
                <span>{i + 1}. {item.province}</span>
                <span className="font-semibold">{item.pm25}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Trend Chart (Current Snapshot)</h2>
        <PmChart data={ranking.slice(0, 8).map((r) => ({ name: r.province, value: r.pm25 }))} />
      </Card>
    </section>
  );
}
