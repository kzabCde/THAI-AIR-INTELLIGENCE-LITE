"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HistoricalPmChart, RiskRadar } from "@/components/dashboard/charts";
import { Card } from "@/components/ui/card";
import { cache } from "@/lib/cache";
import { buildThailandSnapshot } from "@/lib/engine";
import type { ProvinceSnapshot } from "@/types/air";

export default function ProvinceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [rows, setRows] = useState<ProvinceSnapshot[]>([]);

  useEffect(() => {
    setRows(cache.getSnapshot());
    buildThailandSnapshot().then(setRows);

    const weatherTimer = setInterval(() => {
      buildThailandSnapshot().then(setRows);
    }, 60 * 60 * 1000);

    return () => clearInterval(weatherTimer);
  }, []);

  const province = rows.find((r) => r.slug === slug);
  const history = useMemo(() => cache.getHistoryByProvince(slug), [slug, rows]);

  if (!province) return <p>Loading province intelligence...</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{province.province_name_en} ({province.province_name_th})</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-slate-500">Current PM2.5</p><p className="text-2xl font-bold">{province.air.pm25}</p></Card>
        <Card><p className="text-xs text-slate-500">Current PM10</p><p className="text-2xl font-bold">{province.air.pm10}</p></Card>
        <Card><p className="text-xs text-slate-500">AQI</p><p className="text-2xl font-bold">{province.air.aqi}</p></Card>
        <Card><p className="text-xs text-slate-500">Risk level</p><p className="text-xl font-semibold">{province.risk_level}</p></Card>
      </div>

      {province.predicted_pm25 > 75 && (
        <Card className="border-red-500">
          <p className="font-semibold text-red-600">Alert: PM2.5 predicted above 75 tomorrow.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Historical PM chart (local 90-day cache)</h2>
          <HistoricalPmChart history={history} />
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Risk factors radar</h2>
          <RiskRadar item={province} />
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Forecast next 3 days (browser model)</h2>
        <ul className="space-y-2 text-sm">
          <li>Tomorrow: {province.predicted_pm25} μg/m³ ({province.prediction_model})</li>
          <li>Day +2: {(province.predicted_pm25 * 1.03).toFixed(1)} μg/m³</li>
          <li>Day +3: {(province.predicted_pm25 * 1.05).toFixed(1)} μg/m³</li>
        </ul>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Weather impact + stations</h2>
        <p className="text-sm">Temp {province.weather.temp}°C • Humidity {province.weather.humidity}% • Wind {province.weather.wind} km/h • Rain {province.weather.rain} mm</p>
        <p className="mt-2 text-sm">Nearby stations/sources: {province.nearby_stations.join(", ")}</p>
        <p className="mt-2 text-sm">Insight: {province.insight}</p>
      </Card>
    </section>
  );
}
