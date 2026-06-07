"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Expand, Gauge, Search, Sparkles, TrendingUp, Wind } from "lucide-react";
import { ProvinceDrawer } from "@/components/panel/province-drawer";
import { Card } from "@/components/ui/card";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";

const ThailandMap = dynamic(() => import("@/components/ThailandMap").then((m) => m.ThailandMap), {
  ssr: false,
  loading: () => <div className="h-[72vh] animate-pulse rounded-[2rem] bg-slate-200/70 dark:bg-slate-800" />,
});

export default function MapPage() {
  const { data, error } = useThailandSnapshot();
  const rows = data?.data ?? [];
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [timelineIndex, setTimelineIndex] = useState(6);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 150);
    return () => window.clearTimeout(t);
  }, [search]);

  const ranked = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25), [rows]);
  const selectedRow = ranked.find((x) => x.slug === selected) ?? null;
  const timeline = useMemo(() => Array.from({ length: 7 }).map((_, i) => Math.max(5, (selectedRow?.air.pm25 ?? 20) - (6 - i) * 2)), [selectedRow?.air.pm25]);

  const timelineAdjustedRows = useMemo(
    () => ranked.map((x) => ({ ...x, air: { ...x.air, pm25: Math.max(1, x.air.pm25 - (6 - timelineIndex) * 1.2) } })),
    [ranked, timelineIndex],
  );

  const stats = useMemo(() => {
    const average = ranked.length ? ranked.reduce((sum, row) => sum + row.air.pm25, 0) / ranked.length : 0;
    const unhealthy = ranked.filter((row) => row.air.pm25 > 75).length;

    return {
      average,
      unhealthy,
      worst: ranked[0],
      best: [...ranked].reverse()[0],
    };
  }, [ranked]);

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white/72 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(14,165,233,0.22),transparent_34%),radial-gradient(circle_at_95%_15%,rgba(16,185,129,0.18),transparent_28%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_25rem] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
              <Sparkles size={14} /> New Thailand Map UI
            </span>
            <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">แผนที่ PM2.5 ประเทศไทย โฉมใหม่แบบ Air Atlas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 md:text-base">ดูภาพรวมทั้งประเทศบนแผนที่ประเทศไทยที่แบ่งรายจังหวัดและรายภาคชัดเจน สีตามระดับความเสี่ยง และไทม์ไลน์ย้อนหลัง 7 วัน.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "เฉลี่ยประเทศ", value: `${stats.average.toFixed(1)}`, suffix: "μg/m³", icon: Gauge },
              { label: "พื้นที่เฝ้าระวัง", value: stats.unhealthy, suffix: "จังหวัด", icon: TrendingUp },
              { label: "สูงสุด", value: stats.worst?.province_name_th ?? "-", suffix: "", icon: Wind },
              { label: "ดีที่สุด", value: stats.best?.province_name_th ?? "-", suffix: "", icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <Icon size={18} className="text-sky-500" />
                  <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
                  <p className="mt-1 truncate text-xl font-black text-slate-950 dark:text-white">{item.value} <span className="text-xs font-bold text-slate-500">{item.suffix}</span></p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">เชื่อมต่อข้อมูลสดไม่สำเร็จ: {error}</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[1.75rem] border border-white/60 bg-white/70 p-3 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input className="w-full rounded-2xl border border-slate-200 bg-white/80 py-3 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900/80 dark:focus:ring-sky-500/10" placeholder="ค้นหาจังหวัดเพื่อโฟกัส เช่น เชียงใหม่ กรุงเทพฯ ภูเก็ต" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <button onClick={() => document.documentElement.requestFullscreen?.()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <Expand size={17} /> เต็มจอ
            </button>
          </div>

          <Card className="border-0 bg-transparent p-0 shadow-none">
            <ThailandMap rows={timelineAdjustedRows} search={debouncedSearch} selectedSlug={selected} pmDeltaByProvince={{}} onSelect={setSelected} />
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="rounded-[1.75rem] border-white/60 bg-white/78 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950 dark:text-white">ไทม์ไลน์ย้อนหลัง</p>
                <p className="text-xs text-slate-500">เลื่อนเพื่อจำลองค่าในช่วง 7 วัน</p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">วันที่ {timelineIndex + 1}/7</span>
            </div>
            <input type="range" min={0} max={6} value={timelineIndex} onChange={(e) => setTimelineIndex(Number(e.target.value))} className="mt-5 w-full accent-sky-500" />
            <div className="mt-2 flex justify-between text-[11px] font-semibold text-slate-400">
              <span>ย้อนหลัง</span>
              <span>ล่าสุด</span>
            </div>
          </Card>

          <Card className="rounded-[1.75rem] border-white/60 bg-white/78 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55">
            <h2 className="font-black text-slate-950 dark:text-white">พื้นที่เสี่ยงสูงสุด</h2>
            <p className="mt-1 text-xs text-slate-500">คลิกเพื่อโฟกัสบนแผนที่และเปิดรายละเอียด</p>
            <ol className="mt-4 space-y-2 text-sm">
              {ranked.slice(0, 10).map((row, i) => (
                <li key={row.slug}>
                  <button onClick={() => setSelected(row.slug)} className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md dark:border-slate-800 dark:bg-white/5 dark:hover:border-sky-500/30">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white dark:bg-white dark:text-slate-950">{i + 1}</span>
                      <span className="truncate font-bold group-hover:text-sky-600 dark:group-hover:text-sky-300">{row.province_name_th}</span>
                    </span>
                    <span className="shrink-0 font-black text-rose-600 dark:text-rose-300">{row.air.pm25.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>

      <ProvinceDrawer selected={selectedRow} timeline={timeline} onClose={() => setSelected(null)} onCompare={() => undefined} />
    </section>
  );
}
