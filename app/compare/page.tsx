"use client";

import { useEffect, useMemo, useState } from "react";
import { HistoricalPmChart } from "@/components/dashboard/charts";
import { Card } from "@/components/ui/card";
import { cache } from "@/lib/cache";
import { buildThailandSnapshot } from "@/lib/engine";
import type { HistoricalPoint, ProvinceSnapshot } from "@/types/air";

export default function ComparePage() {
  const [rows, setRows] = useState<ProvinceSnapshot[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setRows(cache.getSnapshot());
    buildThailandSnapshot().then((data) => {
      setRows(data);
      if (!selected.length) setSelected(data.slice(0, 2).map((x) => x.slug));
    });
  }, []);

  const pick = (slug: string) => {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((x) => x !== slug);
      if (prev.length >= 5) return prev;
      return [...prev, slug];
    });
  };

  const mergedHistory = useMemo(() => {
    const list: Array<HistoricalPoint & { name: string }> = [];
    selected.forEach((slug) => {
      const row = rows.find((x) => x.slug === slug);
      if (!row) return;
      cache.getHistoryByProvince(slug).forEach((h) => list.push({ ...h, name: row.province_name_en }));
    });
    return list.slice(-120);
  }, [rows, selected]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Compare Provinces (2-5)</h1>
      <Card>
        <p className="mb-2 text-sm text-slate-500">Select up to 5 provinces:</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <button key={row.slug} className={`rounded-lg border p-2 text-left ${selected.includes(row.slug) ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : ""}`} onClick={() => pick(row.slug)}>
              <p className="font-medium">{row.province_name_en}</p>
              <p className="text-xs">PM2.5 {row.air.pm25}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {selected.map((slug) => {
          const row = rows.find((x) => x.slug === slug);
          if (!row) return null;
          return (
            <Card key={slug}>
              <p className="font-semibold">{row.province_name_en}</p>
              <p className="text-sm">PM2.5 {row.air.pm25} • Forecast {row.predicted_pm25} • Risk {row.risk_level}</p>
            </Card>
          );
        })}
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Historical compare chart</h2>
        <HistoricalPmChart history={mergedHistory} />
      </Card>
    </section>
  );
}
