"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cache } from "@/lib/cache";
import { buildThailandSnapshot } from "@/lib/engine";
import type { ProvinceSnapshot } from "@/types/air";

function metrics(actual: number[], predicted: number[]) {
  if (!actual.length || actual.length !== predicted.length) return { mae: 0, rmse: 0 };
  const mae = actual.reduce((sum, a, i) => sum + Math.abs(a - predicted[i]), 0) / actual.length;
  const rmse = Math.sqrt(actual.reduce((sum, a, i) => sum + (a - predicted[i]) ** 2, 0) / actual.length);
  return { mae: Number(mae.toFixed(2)), rmse: Number(rmse.toFixed(2)) };
}

export default function AnalyticsPage() {
  const [rows, setRows] = useState<ProvinceSnapshot[]>([]);

  useEffect(() => {
    setRows(cache.getSnapshot());
    buildThailandSnapshot().then(setRows);
  }, []);

  const evals = useMemo(() => {
    const actual: number[] = [];
    const predicted: number[] = [];
    rows.slice(0, 25).forEach((row) => {
      const history = cache.getHistoryByProvince(row.slug);
      if (history.length < 2) return;
      actual.push(history.at(-1)!.pm25);
      predicted.push(row.predicted_pm25);
    });
    return metrics(actual, predicted);
  }, [rows]);

  const sourceReliability = useMemo(() => {
    const counts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.air.source] = (acc[r.air.source] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Thesis Analytics</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-xs text-slate-500">Model 1</p><p className="font-semibold">7-day Moving Average</p></Card>
        <Card><p className="text-xs text-slate-500">Model 2</p><p className="font-semibold">Linear Regression</p></Card>
        <Card><p className="text-xs text-slate-500">Model 3</p><p className="font-semibold">Weighted Smart Score</p></Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Formula explanation</h2>
        <p className="text-sm">predicted_pm25 = (last_day × 0.4) + (7day_avg × 0.3) + (hotspot_factor × 0.2) + (low_wind_factor × 0.1)</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Error score (sampled)</h2>
          <p>MAE: <b>{evals.mae}</b></p>
          <p>RMSE: <b>{evals.rmse}</b></p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Data source reliability (coverage count)</h2>
          <ul className="text-sm">
            {sourceReliability.map(([source, n]) => <li key={source}>{source}: {n} provinces</li>)}
          </ul>
        </Card>
      </div>
    </section>
  );
}
