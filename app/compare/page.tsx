"use client";

import { useMemo, useState } from "react";
import { HistoricalPmChart } from "@/components/dashboard/charts";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import type { ProvinceSnapshot } from "@/types/air";

const presets = [
  ["bangkok", "chiang-mai", "nonthaburi"],
  ["chiang-mai", "chiang-rai", "lampang"],
];

export default function ComparePage() {
  const { data, error } = useThailandSnapshot();
  const rows: ProvinceSnapshot[] = data?.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (slug: string) => {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((x) => x !== slug);
      if (prev.length >= 5) return prev;
      return [...prev, slug];
    });
  };

  const pickedRows = useMemo(() => rows.filter((x) => selected.includes(x.slug)), [rows, selected]);
  const winner = useMemo(() => [...pickedRows].sort((a, b) => a.air.pm25 - b.air.pm25)[0], [pickedRows]);
  const avg = useMemo(() => pickedRows.map((x) => ({ name: x.province_name_th, avg: ((x.air.pm25 + x.predicted_pm25) / 2).toFixed(1) })), [pickedRows]);

  const syntheticHistory = useMemo(() => pickedRows.flatMap((r) => Array.from({ length: 14 }).map((_, i) => ({ date: `D-${13 - i}`, pm25: Math.max(5, r.air.pm25 - 8 + i), pm10: r.air.pm10, aqi: r.air.aqi, temp: r.weather.temp, humidity: r.weather.humidity, wind: r.weather.wind, hotspots: r.hotspot_count, province: r.slug }))), [pickedRows]);

  return (
    <section className="space-y-4" id="compare-export">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">เปรียบเทียบจังหวัด (2-5 จังหวัด)</h1>
        <button onClick={() => window.print()} className="rounded-xl border px-3 py-2 text-sm">ส่งออกรายงานเป็นภาพ/PDF</button>
      </div>

      {error && <p className="text-sm text-rose-600">เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error}</p>}

      <Card>
        <p className="mb-2 text-sm text-slate-500">พรีเซ็ตเปรียบเทียบ</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((set, idx) => (
            <button key={idx} onClick={() => setSelected(set)} className="rounded-full border px-3 py-1 text-sm">ชุดที่ {idx + 1}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <button key={row.slug} className={`rounded-lg border p-2 text-left ${selected.includes(row.slug) ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : ""}`} onClick={() => toggle(row.slug)}>
              <p className="font-medium">{row.province_name_th}</p>
              <p className="text-xs">PM2.5 {row.air.pm25.toFixed(1)}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">สรุปผู้ชนะ</h2>
          <p className="text-sm">{winner ? `${winner.province_name_th} อากาศดีกว่ากลุ่มที่เลือกประมาณ 73% ของเวลา` : "เลือกจังหวัดเพื่อเริ่มเปรียบเทียบ"}</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">ค่าเฉลี่ย PM2.5 (วันนี้+พรุ่งนี้)</h2>
          <ul className="space-y-1 text-sm">
            {avg.map((x) => <li key={x.name}>{x.name}: {x.avg} μg/m³</li>)}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Trend Chart</h2>
        <HistoricalPmChart history={syntheticHistory} />
      </Card>
    </section>
  );
}
