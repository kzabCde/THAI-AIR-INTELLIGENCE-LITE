"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import type { ProvinceSnapshot } from "@/types/air";

const ProvinceRankingChart = dynamic(() => import("@/components/dashboard/charts").then((m) => m.ProvinceRankingChart), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});
const ForecastTrendChart = dynamic(() => import("@/components/dashboard/charts").then((m) => m.ForecastTrendChart), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});
const ThailandHeatMap = dynamic(() => import("@/components/dashboard/heatmap").then((m) => m.ThailandHeatMap), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});
const RealtimeTicker = dynamic(() => import("@/components/RealtimeTicker").then((m) => m.RealtimeTicker), { ssr: false });

const rankModes = {
  worst: "ฝุ่นสูงสุด",
  best: "อากาศดีที่สุด",
  risk: "เสี่ยงพรุ่งนี้",
} as const;

type RankMode = keyof typeof rankModes;

export default function DashboardPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState<RankMode>("worst");
  const { data, isLoading, error } = useThailandSnapshot();
  const rows: ProvinceSnapshot[] = data?.data ?? [];

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const indexedRows = useMemo(
    () => rows.map((row) => ({ row, searchText: `${row.province_name_th} ${row.province_name_en}`.toLowerCase() })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return rows;
    return indexedRows.filter((entry) => entry.searchText.includes(q)).map((entry) => entry.row);
  }, [debouncedQuery, indexedRows, rows]);

  const ranked = useMemo(() => {
    const copy = [...filtered];
    if (mode === "best") return copy.sort((a, b) => a.air.pm25 - b.air.pm25);
    if (mode === "risk") return copy.sort((a, b) => b.predicted_pm25 - a.predicted_pm25);
    return copy.sort((a, b) => b.air.pm25 - a.air.pm25);
  }, [filtered, mode]);

  const summary = useMemo(() => {
    const pmAvg = ranked.length ? ranked.reduce((sum, r) => sum + r.air.pm25, 0) / ranked.length : 0;
    return { pmAvg, worst: ranked[0], best: [...ranked].sort((a, b) => a.air.pm25 - b.air.pm25)[0] };
  }, [ranked]);

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold md:text-3xl">แดชบอร์ดคุณภาพอากาศประเทศไทย</h1>
      <RealtimeTicker updatedAt={data?.updatedAt ? new Date(data.updatedAt) : new Date()} rows={ranked} />
      {error && <p className="text-sm text-rose-600">เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-slate-500">จังหวัดที่ครอบคลุม</p><p className="text-2xl font-bold">{rows.length}/77</p></Card>
        <Card><p className="text-xs text-slate-500">PM2.5 เฉลี่ยประเทศ</p><p className="text-2xl font-bold">{summary.pmAvg.toFixed(1)}</p></Card>
        <Card><p className="text-xs text-slate-500">ค่าฝุ่นสูงสุด</p><p className="font-semibold">{summary.worst?.province_name_th ?? "-"}</p></Card>
        <Card><p className="text-xs text-slate-500">อากาศดีที่สุด</p><p className="font-semibold">{summary.best?.province_name_th ?? "-"}</p></Card>
      </div>

      <Card className="space-y-3">
        <input className="w-full rounded-lg border border-slate-300 p-2" placeholder="ค้นหาจังหวัด ไทย / English" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {(Object.keys(rankModes) as RankMode[]).map((key) => (
            <button key={key} onClick={() => setMode(key)} className={`rounded-full px-4 py-1 text-sm ${mode === key ? "bg-sky-600 text-white" : "border border-slate-300"}`}>
              {rankModes[key]}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">แผนที่ความเข้ม PM2.5 ประเทศไทย</h2>
        {isLoading ? <p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p> : <ThailandHeatMap rows={ranked} />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">อันดับจังหวัด ({rankModes[mode]})</h2><ProvinceRankingChart rows={ranked} /></Card>
        <Card><h2 className="mb-2 font-semibold">แนวโน้มวันนี้เทียบพรุ่งนี้</h2><ForecastTrendChart rows={ranked} /></Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">รายชื่อจังหวัด</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((p) => (
            <Link key={p.slug} prefetch className="rounded-xl border p-2 hover:bg-slate-50 dark:hover:bg-slate-900" href={`/province/${p.slug}`}>
              <p className="font-medium">{p.province_name_th}</p>
              <p className="text-xs text-slate-500">{p.province_name_en} • {p.region}</p>
              <p className="text-sm">PM2.5 {p.air.pm25.toFixed(1)} • คาดการณ์ {p.predicted_pm25.toFixed(1)}</p>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
