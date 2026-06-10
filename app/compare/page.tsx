"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import { pm25Color, riskBg, riskLabel } from "@/lib/colors";
import type { ProvinceSnapshot } from "@/types/air";
import type { HistoricalPoint } from "@/types/air";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const PRESETS = [
  { label: "กรุงเทพปริมณฑล", slugs: ["bangkok", "nonthaburi", "pathum-thani", "samut-prakan"] },
  { label: "ภาคเหนือ", slugs: ["chiang-mai", "chiang-rai", "lampang", "mae-hong-son"] },
  { label: "ภาคอีสาน", slugs: ["khon-kaen", "udon-thani", "nakhon-ratchasima", "ubon-ratchathani"] },
  { label: "ภาคใต้", slugs: ["phuket", "songkhla", "surat-thani", "krabi"] },
];

const LINE_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

export default function ComparePage() {
  const { data, error } = useThailandSnapshot();
  const rows: ProvinceSnapshot[] = data?.data ?? [];
  const [selected, setSelected] = useState<string[]>(["chiang-mai", "bangkok", "phuket"]);
  const [searchQ, setSearchQ] = useState("");
  const [historyMap, setHistoryMap] = useState<Record<string, HistoricalPoint[]>>({});

  const toggle = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : prev.length >= 5 ? prev : [...prev, slug]
    );

  useEffect(() => {
    const missing = selected.filter((s) => !historyMap[s]);
    if (!missing.length) return;
    Promise.all(
      missing.map((s) =>
        fetch(`/api/history?slug=${s}&days=7`)
          .then((r) => r.json())
          .then((d) => ({ slug: s, history: d.history ?? [] as HistoricalPoint[] }))
          .catch(() => ({ slug: s, history: [] as HistoricalPoint[] }))
      )
    ).then((results) => {
      setHistoryMap((prev) => {
        const next = { ...prev };
        results.forEach(({ slug, history }) => { next[slug] = history; });
        return next;
      });
    });
  }, [selected]);

  const pickedRows = useMemo(() => rows.filter((x) => selected.includes(x.slug)), [rows, selected]);
  const winner = useMemo(() => [...pickedRows].sort((a, b) => a.air.pm25 - b.air.pm25)[0], [pickedRows]);

  // Build combined multi-line chart data from histories
  const chartData = useMemo(() => {
    const dates = new Set<string>();
    for (const slug of selected) {
      const hist = historyMap[slug] ?? [];
      hist.forEach((h) => dates.add(h.date));
    }
    const sortedDates = [...dates].sort();
    return sortedDates.map((date) => {
      const row: Record<string, unknown> = { date: date.slice(5) };
      for (const slug of selected) {
        const hist = historyMap[slug] ?? [];
        const point = hist.find((h) => h.date === date);
        const province = rows.find((r) => r.slug === slug);
        row[slug] = point?.pm25 ?? province?.air.pm25 ?? null;
      }
      return row;
    });
  }, [selected, historyMap, rows]);

  const filteredRows = useMemo(() => {
    if (!searchQ.trim()) return rows;
    const q = searchQ.toLowerCase();
    return rows.filter((r) => r.province_name_th.includes(q) || r.province_name_en.toLowerCase().includes(q));
  }, [rows, searchQ]);

  return (
    <section className="space-y-5" id="compare-export">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold">เปรียบเทียบจังหวัด</h1>
        <button onClick={() => window.print()} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700">ส่งออก PDF</button>
      </div>

      {error && <p className="text-sm text-rose-600">เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error}</p>}

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs font-medium text-slate-500 self-center">พรีเซ็ต:</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setSelected(p.slugs)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
            {p.label}
          </button>
        ))}
        <button onClick={() => setSelected([])} className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100">ล้าง</button>
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s, i) => {
            const p = rows.find((r) => r.slug === s);
            return (
              <span key={s} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: LINE_COLORS[i] ?? "#64748b" }}>
                {p?.province_name_th ?? s}
                <button onClick={() => toggle(s)} className="opacity-70 hover:opacity-100">✕</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Multi-line chart */}
      {chartData.length > 0 && selected.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="mb-3 text-base font-semibold">PM2.5 ย้อนหลัง 7 วัน (เปรียบเทียบ)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: unknown) => typeof v === "number" ? [`${v.toFixed(1)} μg/m³`] : ["-"]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={35.4} stroke="#f97316" strokeDasharray="5 3" label={{ value: "มาตรฐาน", fontSize: 9 }} />
              {selected.map((slug, i) => {
                const p = rows.find((r) => r.slug === slug);
                return (
                  <Line key={slug} type="monotone" dataKey={slug} name={p?.province_name_th ?? slug} stroke={LINE_COLORS[i] ?? "#64748b"} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comparison table */}
      {pickedRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <h2 className="mb-3 text-base font-semibold">ตารางเปรียบเทียบ</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="py-2 pr-4 text-left">จังหวัด</th>
                  <th className="py-2 pr-4">PM2.5</th>
                  <th className="py-2 pr-4">PM10</th>
                  <th className="py-2 pr-4">AQI</th>
                  <th className="py-2 pr-4">อุณหภูมิ</th>
                  <th className="py-2 pr-4">ลม</th>
                  <th className="py-2 pr-4">Hotspot</th>
                  <th className="py-2">ระดับ</th>
                </tr>
              </thead>
              <tbody>
                {pickedRows.map((p, i) => (
                  <tr key={p.slug} className={`border-b last:border-0 ${p.slug === winner?.slug ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[i] ?? "#64748b" }} />
                        <a href={`/province/${p.slug}`} className="font-medium hover:underline">{p.province_name_th}</a>
                        {p.slug === winner?.slug && <span className="text-xs text-green-600">✓ ดีที่สุด</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-center font-bold" style={{ color: pm25Color(p.air.pm25) }}>{p.air.pm25.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-center text-orange-600">{p.air.pm10.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-center text-purple-600">{p.air.aqi}</td>
                    <td className="py-2 pr-4 text-center text-cyan-600">{p.weather.temp.toFixed(1)}°C</td>
                    <td className="py-2 pr-4 text-center text-teal-600">{p.weather.wind.toFixed(1)} m/s</td>
                    <td className="py-2 pr-4 text-center text-red-600">{p.hotspot_count}</td>
                    <td className="py-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskBg(p.air.pm25)}`}>{riskLabel(p.air.pm25)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Province picker */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-semibold">เลือกจังหวัด (สูงสุด 5)</h2>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="ค้นหา..."
            className="ml-auto rounded-xl border border-slate-300 px-3 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {filteredRows.map((row) => {
              const isSelected = selected.includes(row.slug);
              const colorIdx = selected.indexOf(row.slug);
              return (
                <button
                  key={row.slug}
                  className={`rounded-xl border p-2.5 text-left text-sm transition ${isSelected ? "border-sky-400 dark:border-sky-600" : "border-slate-200 hover:border-slate-400 dark:border-slate-700"}`}
                  style={isSelected ? { borderColor: LINE_COLORS[colorIdx] ?? "#0ea5e9", backgroundColor: (LINE_COLORS[colorIdx] ?? "#0ea5e9") + "15" } : {}}
                  onClick={() => toggle(row.slug)}
                >
                  <p className="font-medium leading-tight">{row.province_name_th}</p>
                  <p className="text-[11px]" style={{ color: pm25Color(row.air.pm25) }}>{row.air.pm25.toFixed(1)} μg/m³</p>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </section>
  );
}
