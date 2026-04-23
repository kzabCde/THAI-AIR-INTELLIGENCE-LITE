"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { HistoricalPmChart, RiskRadar } from "@/components/dashboard/charts";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import type { ProvinceSnapshot } from "@/types/air";

export default function ProvinceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useThailandSnapshot();
  const rows: ProvinceSnapshot[] = data?.data ?? [];
  const province = rows.find((r) => r.slug === slug);

  const trend = useMemo(() => {
    if (!province) return 0;
    return province.predicted_pm25 - province.air.pm25;
  }, [province]);

  const history = useMemo(() => {
    if (!province) return [];
    return Array.from({ length: 30 }).map((_, i) => ({
      date: `D-${29 - i}`,
      pm25: Math.max(4, province.air.pm25 - 12 + i * 0.5),
      pm10: province.air.pm10,
      aqi: province.air.aqi,
      temp: province.weather.temp,
      humidity: province.weather.humidity,
      wind: province.weather.wind,
      hotspots: province.hotspot_count,
      province: province.slug,
    }));
  }, [province]);

  if (!province) return <p>กำลังโหลดข้อมูลจังหวัด...</p>;

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border bg-gradient-to-br from-sky-100/70 to-indigo-100/60 p-5 dark:from-sky-950/40 dark:to-indigo-950/30">
        <h1 className="text-3xl font-bold">{province.province_name_th}</h1>
        <p className="text-sm text-slate-600">{province.province_name_en}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium">PM2.5 {province.air.pm25.toFixed(1)}</span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium">แนวโน้ม {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}</span>
          <button className="rounded-full border px-3 py-1 text-sm">☆ เพิ่มรายการโปรด</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-slate-500">AQI</p><p className="text-2xl font-bold">{province.air.aqi}</p></Card>
        <Card><p className="text-xs text-slate-500">PM10</p><p className="text-2xl font-bold">{province.air.pm10.toFixed(1)}</p></Card>
        <Card><p className="text-xs text-slate-500">คาดการณ์ 3 วัน</p><p className="text-sm">{province.predicted_pm25.toFixed(1)} / {(province.predicted_pm25 * 1.04).toFixed(1)} / {(province.predicted_pm25 * 1.08).toFixed(1)}</p></Card>
        <Card><p className="text-xs text-slate-500">คำแนะนำสุขภาพ</p><p className="text-sm">{province.air.pm25 > 75 ? "งดกิจกรรมกลางแจ้งและใช้หน้ากาก N95" : "สามารถทำกิจกรรมกลางแจ้งได้"}</p></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">กราฟย้อนหลัง</h2><HistoricalPmChart history={history} /></Card>
        <Card><h2 className="mb-2 font-semibold">Risk Factors</h2><RiskRadar item={province} /></Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">สภาพอากาศ</h2>
        <p className="text-sm">อุณหภูมิ {province.weather.temp}°C • ความชื้น {province.weather.humidity}% • ลม {province.weather.wind} km/h • ฝน {province.weather.rain} mm</p>
        <Link href="/compare" className="mt-3 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">เปรียบเทียบกับจังหวัดอื่น</Link>
      </Card>
    </section>
  );
}
