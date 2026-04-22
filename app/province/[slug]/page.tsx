"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { aqiLabel, fetchThaiAirData, fetchWeather, getForecast, healthTip, toAqi } from "@/lib/air";
import type { ProvinceAir, ProvinceWeather } from "@/types/air";
import { PmChart } from "@/components/pm-chart";

export default function ProvinceDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [province, setProvince] = useState<ProvinceAir | null>(null);
  const [weather, setWeather] = useState<ProvinceWeather | null>(null);

  useEffect(() => {
    fetchThaiAirData().then((items) => {
      const found = items.find((x) => x.slug === slug) ?? null;
      setProvince(found);
      if (found) fetchWeather(found.lat, found.lon).then(setWeather);
    });
  }, [slug]);

  const forecast = useMemo(() => (province ? getForecast(province.pm25) : []), [province]);

  if (!province) return <p className="text-sm text-slate-600">Loading province data...</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">{province.province}</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-slate-500">PM2.5 Now</p><p className="text-2xl font-bold">{province.pm25}</p></Card>
        <Card><p className="text-xs text-slate-500">Estimated AQI</p><p className="text-2xl font-bold">{toAqi(province.pm25)}</p></Card>
        <Card><p className="text-xs text-slate-500">Air Quality</p><p className="font-semibold">{aqiLabel(province.pm25)}</p></Card>
        <Card><p className="text-xs text-slate-500">Last Updated</p><p className="text-sm">{new Date(province.fetchedAt).toLocaleString()}</p></Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Weather</h2>
        {weather ? (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <p>Temperature: <b>{weather.temperature}°C</b></p>
            <p>Humidity: <b>{weather.humidity}%</b></p>
            <p>Wind: <b>{weather.wind} km/h</b></p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Weather unavailable.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">3-Day Forecast Estimate (local logic)</h2>
        <PmChart data={forecast.map((f) => ({ name: f.day, value: f.estimate }))} />
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Health Tip</h2>
        <p>{healthTip(province.pm25)}</p>
      </Card>
    </section>
  );
}
