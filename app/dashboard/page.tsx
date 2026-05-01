"use client";

import { useEffect, useMemo, useState } from "react";
import districts from "@/data/districts.json";
import { AirCard } from "@/components/district/AirCard";
import { DistrictSelector } from "@/components/district/DistrictSelector";
import { ForecastChart } from "@/components/district/ForecastChart";
import { InsightPanel } from "@/components/district/InsightPanel";
import { MapView } from "@/components/district/MapView";
import { fetchAirQuality, NormalizedAirQuality } from "@/services/apiService";

type District = (typeof districts)[number] & { pm25?: number; aqi?: number };

export default function DistrictAirDashboard() {
  const [selected, setSelected] = useState<District>(districts[0]);
  const [data, setData] = useState<NormalizedAirQuality | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [allRows, setAllRows] = useState<District[]>(districts);

  const load = async (d: District) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAirQuality(d.lat, d.lon);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(selected); }, [selected]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const sampled = await Promise.all(districts.slice(0, 10).map(async (d) => {
        try {
          const aq = await fetchAirQuality(d.lat, d.lon);
          return { ...d, pm25: aq.pm25, aqi: aq.aqi };
        } catch {
          return d;
        }
      }));
      setAllRows(sampled.concat(districts.slice(10)));
    }, 300000);
    return () => clearInterval(timer);
  }, []);

  const topRisk = useMemo(() => [...allRows].filter((x) => x.pm25).sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0)).slice(0, 10), [allRows]);
  const pmAvg = useMemo(() => {
    const vals = allRows.map((x) => x.pm25).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [allRows]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">ระบบแดชบอร์ดติดตามและพยากรณ์คุณภาพอากาศระดับอำเภอทั่วประเทศไทย</h1>
      <DistrictSelector districts={districts} onSelect={setSelected} />
      {loading && <div className="h-20 animate-pulse rounded bg-slate-100" />}
      {error && <p className="text-rose-600">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <AirCard title="PM2.5 เฉลี่ย (sampled)" value={`${pmAvg.toFixed(1)} µg/m³`} alert={pmAvg > 50} />
        <AirCard title="AQI พื้นที่ที่เลือก" value={data ? `${data.aqi}` : "-"} alert={(data?.aqi ?? 0) > 100} />
        <AirCard title="อำเภอเสี่ยง (PM2.5 > 50)" value={`${allRows.filter((r) => (r.pm25 ?? 0) > 50).length}`} />
        <AirCard title="แหล่งข้อมูล" value={data?.source === "primary" ? "IQAir (primary)" : data ? "OpenWeather (fallback)" : "-"} />
      </div>

      <MapView districts={allRows} onPick={setSelected} />

      <div className="rounded-xl border p-4">
        <h3 className="mb-2 font-semibold">Top 10 อำเภอเสี่ยง</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {topRisk.map((r) => <div key={`${r.province}-${r.district}`} className="rounded border p-2 text-sm">{r.district} ({r.province}) • PM2.5 {(r.pm25 ?? 0).toFixed(1)}</div>)}
        </div>
      </div>

      <ForecastChart data={data} />
      <InsightPanel data={data} />

      <div className="rounded-xl border p-4">
        <h3 className="font-semibold">Factor Panel</h3>
        <p className="text-sm">Temp: {data?.factors.temperature?.toFixed(1) ?? "-"}°C | Humidity: {data?.factors.humidity ?? "-"}% | Wind: {data?.factors.wind ?? "-"} m/s | Hotspot: {data?.factors.hotspot ?? "-"}</p>
        <p className="mt-2 text-xs text-slate-500">แจ้งเตือนเมื่อ PM2.5 &gt; 50 หรือ AQI &gt; 100</p>
      </div>
    </section>
  );
}
