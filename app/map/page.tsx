"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ProvinceDrawer } from "@/components/panel/province-drawer";
import { Card } from "@/components/ui/card";
import { ProvinceSummaryCard } from "@/components/province/province-summary-card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import { pm25Color, riskBg, riskLabel } from "@/lib/colors";
import type { ProvinceSnapshot } from "@/types/air";

const InteractiveMap = dynamic(
  () => import("@/components/map/interactive-map").then((m) => m.InteractiveMap),
  {
    ssr: false,
    loading: () => <div className="h-[500px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />,
  }
);

const REGIONS = ["All", "North", "Northeast", "Central", "East", "West", "South"];
const REGION_TH: Record<string, string> = {
  All: "ทั้งหมด", North: "เหนือ", Northeast: "อีสาน",
  Central: "กลาง", East: "ตะวันออก", West: "ตะวันตก", South: "ใต้",
};

export default function MapPage() {
  const { data, error } = useThailandSnapshot();
  const rows = data?.data ?? [];
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState("All");
  const [timelineIndex, setTimelineIndex] = useState(6);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const selectedRow = useMemo(() => rows.find((x) => x.slug === selected) ?? null, [rows, selected]);

  const timeline = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => Math.max(5, (selectedRow?.air.pm25 ?? 20) - (6 - i) * 2)),
    [selectedRow?.air.pm25]
  );

  const timelineAdjustedRows = useMemo(
    () => rows.map((x) => ({ ...x, air: { ...x.air, pm25: Math.max(1, x.air.pm25 - (6 - timelineIndex) * 1.2) } })),
    [rows, timelineIndex]
  );

  const filtered = useMemo(() => {
    let list = regionFilter === "All" ? timelineAdjustedRows : timelineAdjustedRows.filter((r) => r.region === regionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.province_name_th.includes(q) || r.province_name_en.toLowerCase().includes(q));
    }
    return list;
  }, [timelineAdjustedRows, regionFilter, search]);

  const ranked = useMemo(() => [...filtered].sort((a, b) => b.air.pm25 - a.air.pm25), [filtered]);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const all = [...rows].sort((a, b) => b.air.pm25 - a.air.pm25);
    const avg = rows.reduce((s, r) => s + r.air.pm25, 0) / rows.length;
    return { worst: all[0], avg, hazardous: rows.filter((r) => r.air.pm25 > 55.4).length };
  }, [rows]);

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold">แผนที่คุณภาพอากาศ</h1>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 p-1 dark:border-slate-700 dark:bg-slate-900">
          {["map", "list"].map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m as "map" | "list")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${viewMode === m ? "bg-sky-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"}`}
            >
              {m === "map" ? "🗺️ แผนที่" : "📋 รายการ"}
            </button>
          ))}
        </div>
        <input
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          placeholder="ค้นหาจังหวัด..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-rose-600">เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error}</p>}

      {/* Region filter */}
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegionFilter(r)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${regionFilter === r ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {REGION_TH[r]}
          </button>
        ))}
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "PM2.5 เฉลี่ยทั้งประเทศ", value: stats.avg.toFixed(1), unit: "μg/m³", color: pm25Color(stats.avg) },
            { label: "จังหวัดเสี่ยงสูง", value: stats.hazardous.toString(), unit: "จังหวัด", color: "#ef4444" },
            { label: "เสี่ยงสูงสุด", value: stats.worst?.province_name_th ?? "-", unit: "", color: pm25Color(stats.worst?.air.pm25 ?? 0) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-lg font-bold" style={{ color: item.color }}>{item.value} <span className="text-xs font-normal text-slate-400">{item.unit}</span></p>
            </div>
          ))}
        </div>
      )}

      {viewMode === "map" ? (
        <>
          {/* Interactive Map */}
          {filtered.length > 0 && (
            <InteractiveMap
              provinces={filtered}
              onSelect={(slug) => { setSelected(slug); }}
              height="520px"
            />
          )}

          {/* Timeline slider */}
          <Card>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">ไทม์ไลน์ย้อนหลัง:</p>
              <input
                type="range"
                min={0}
                max={6}
                value={timelineIndex}
                onChange={(e) => setTimelineIndex(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {timelineIndex === 6 ? "วันนี้" : `${6 - timelineIndex} วันที่แล้ว`}
              </span>
            </div>
          </Card>

          {/* Top risk list */}
          <Card>
            <h2 className="mb-2 font-semibold">พื้นที่เสี่ยงสูง Top 10</h2>
            <ol className="space-y-2 text-sm">
              {ranked.slice(0, 10).map((row, i) => (
                <li key={row.slug} className="flex items-center justify-between border-b pb-1.5 last:border-0">
                  <button onClick={() => setSelected(row.slug)} className="text-left hover:underline font-medium">
                    {i + 1}. {row.province_name_th}
                    <span className="ml-1 text-xs text-slate-400">({row.region})</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{ color: pm25Color(row.air.pm25) }}>{row.air.pm25.toFixed(1)} μg/m³</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${riskBg(row.air.pm25)}`}>{riskLabel(row.air.pm25)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : (
        /* List view */
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {ranked.map((p, i) => (
            <ProvinceSummaryCard key={p.slug} province={p} rank={i + 1} compact />
          ))}
        </div>
      )}

      <ProvinceDrawer selected={selectedRow} timeline={timeline} onClose={() => setSelected(null)} onCompare={() => undefined} />
    </section>
  );
}
