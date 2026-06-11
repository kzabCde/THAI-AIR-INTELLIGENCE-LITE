"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Flame, Search, Wind } from "lucide-react";
import { fmtPm25, fmtNumber } from "@/lib/format";
import { DeltaPill } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/states";

export type ProvinceRow = {
  id: string;
  nameTh: string;
  nameEn: string;
  zoneTh: string;
  pm25: number | null;
  aqi: number | null;
  color: string;
  labelTh: string;
  temp: number | null;
  humidity: number | null;
  wind: number | null;
  hotspots: number;
  delta: number | null;
};

type SortKey = "pm25" | "aqi" | "temp" | "hotspots" | "name";

export function ProvinceTable({ rows }: { rows: ProvinceRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("pm25");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter(
          (r) =>
            r.nameTh.toLowerCase().includes(q) ||
            r.nameEn.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        )
      : rows;
    const sorted = [...base].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.nameTh.localeCompare(b.nameTh, "th");
        case "temp":
          return (b.temp ?? 0) - (a.temp ?? 0);
        case "hotspots":
          return b.hotspots - a.hotspots;
        case "aqi":
          return (b.aqi ?? 0) - (a.aqi ?? 0);
        default:
          return (b.pm25 ?? 0) - (a.pm25 ?? 0);
      }
    });
    return sorted;
  }, [rows, query, sort]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search size={15} className="muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาจังหวัด…"
            className="w-full rounded-xl border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand/40 sm:w-64"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="muted">เรียงตาม</span>
          {(
            [
              ["pm25", "PM2.5"],
              ["aqi", "AQI"],
              ["temp", "อุณหภูมิ"],
              ["hotspots", "จุดความร้อน"],
              ["name", "ชื่อ"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition ${
                sort === key ? "bg-brand text-white" : "muted hover:bg-surface-2"
              }`}
            >
              {label}
              {sort === key && <ArrowUpDown size={11} />}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState title="ไม่พบจังหวัด" description="ลองค้นหาด้วยคำอื่น" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="muted border-b border-border text-left text-xs">
                <th className="py-2.5 pl-4 pr-2 font-medium">#</th>
                <th className="px-2 py-2.5 font-medium">จังหวัด</th>
                <th className="px-2 py-2.5 text-right font-medium">PM2.5</th>
                <th className="px-2 py-2.5 text-center font-medium">ระดับ</th>
                <th className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">อุณหภูมิ</th>
                <th className="hidden px-2 py-2.5 text-right font-medium lg:table-cell">ความชื้น</th>
                <th className="hidden px-2 py-2.5 text-right font-medium md:table-cell">ลม</th>
                <th className="hidden px-2 py-2.5 text-right font-medium md:table-cell">จุดความร้อน</th>
                <th className="px-2 py-2.5 pr-4 text-right font-medium">เปลี่ยนแปลง</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className="border-b border-border/60 transition last:border-0 hover:bg-surface-2">
                  <td className="py-2.5 pl-4 pr-2 tabular-nums muted">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={`/province/${r.id}`} className="group flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span>
                        <span className="font-medium group-hover:text-brand">{r.nameTh}</span>
                        <span className="muted block text-[11px]">{r.zoneTh}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <span className="font-bold tabular-nums">{fmtPm25(r.pm25)}</span>
                    <span className="muted ml-0.5 text-[11px]">µg/m³</span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{ background: r.color }}
                    >
                      {r.labelTh}
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">
                    {r.temp != null ? `${fmtNumber(r.temp, 1)}°` : "–"}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums lg:table-cell">
                    {r.humidity != null ? `${fmtNumber(r.humidity, 0)}%` : "–"}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums md:table-cell">
                    <span className="inline-flex items-center justify-end gap-1">
                      <Wind size={12} className="muted" />
                      {r.wind != null ? fmtNumber(r.wind, 1) : "–"}
                    </span>
                  </td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums md:table-cell">
                    <span className="inline-flex items-center justify-end gap-1">
                      {r.hotspots > 0 && <Flame size={12} className="text-orange-500" />}
                      {r.hotspots}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 pr-4 text-right">
                    {r.delta != null ? <DeltaPill delta={r.delta} suffix="" /> : <span className="muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
