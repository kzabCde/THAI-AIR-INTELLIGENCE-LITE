"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";
import { riskBg, riskLabel, pm25Color } from "@/lib/colors";
import { ProvinceSummaryCard } from "@/components/province/province-summary-card";

const NAV_CARDS = [
  { href: "/map", icon: "🗺️", title: "แผนที่อัจฉริยะ", desc: "Heatmap PM2.5 + Hotspot Layer + AQI ทั่วประเทศ" },
  { href: "/forecast", icon: "📈", title: "พยากรณ์ 7 วัน", desc: "ML Ensemble พยากรณ์รายจังหวัด" },
  { href: "/analytics", icon: "📊", title: "วิเคราะห์ย้อนหลัง", desc: "Historical PM2.5 + Trend + Correlation" },
  { href: "/model-performance", icon: "🤖", title: "Model Performance", desc: "ARIMA · LSTM · XGBoost · LightGBM · RF" },
  { href: "/compare", icon: "⚖️", title: "เปรียบเทียบจังหวัด", desc: "ดู PM2.5 หลายจังหวัดพร้อมกัน" },
  { href: "/dashboard", icon: "🏙️", title: "ระดับอำเภอ", desc: "ติดตามคุณภาพอากาศระดับอำเภอ" },
];

export function HomeLanding() {
  const { data, isLoading } = useThailandSnapshot();
  const rows = data?.data ?? [];

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => b.air.pm25 - a.air.pm25);
    const avg = rows.reduce((s, x) => s + x.air.pm25, 0) / rows.length;
    const hazardous = rows.filter((r) => r.air.pm25 > 55.4).length;
    const goodCount = rows.filter((r) => r.air.pm25 <= 35.4).length;
    const totalHotspots = rows.reduce((s, r) => s + r.hotspot_count, 0);
    return {
      provinces: rows.length,
      avg,
      worst: sorted[0],
      best: sorted.at(-1),
      hazardous,
      goodCount,
      totalHotspots,
      updatedAt: data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("th-TH") : "--:--",
    };
  }, [data?.updatedAt, rows]);

  const worstProvinces = useMemo(
    () => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25).slice(0, 6),
    [rows]
  );

  const REGION_ORDER = ["North", "Northeast", "Central", "East", "West", "South"];
  const regionStats = useMemo(() => {
    if (!rows.length) return [];
    const byRegion: Record<string, number[]> = {};
    for (const r of rows) {
      if (!byRegion[r.region]) byRegion[r.region] = [];
      byRegion[r.region].push(r.air.pm25);
    }
    return REGION_ORDER.map((region) => {
      const vals = byRegion[region] ?? [];
      return {
        region,
        label: { North: "ภาคเหนือ", Northeast: "ภาคอีสาน", Central: "ภาคกลาง", East: "ภาคตะวันออก", West: "ภาคตะวันตก", South: "ภาคใต้" }[region] ?? region,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        count: vals.length,
      };
    });
  }, [rows]);

  return (
    <section className="space-y-8">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-500/20 via-cyan-300/10 to-indigo-600/20 p-8 shadow-xl dark:border-sky-800"
      >
        <div className="absolute right-0 top-0 h-64 w-64 translate-x-16 -translate-y-16 rounded-full bg-sky-400/10 blur-3xl" />
        <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">ประเทศไทย AI คุณภาพอากาศอัจฉริยะ</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
          Thailand Air Intelligence
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300 md:text-base">
          ติดตาม วิเคราะห์ และพยากรณ์คุณภาพอากาศ PM2.5 ทั่วประเทศไทย 77 จังหวัด ด้วย Machine Learning Ensemble
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/map" className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-700">🗺️ แผนที่สด</Link>
          <Link href="/forecast" className="rounded-2xl border border-slate-300 bg-white/80 px-5 py-2.5 text-sm font-semibold hover:bg-white dark:border-slate-700 dark:bg-slate-900">📈 พยากรณ์ 7 วัน</Link>
          <Link href="/model-performance" className="rounded-2xl border border-slate-300 bg-white/80 px-5 py-2.5 text-sm font-semibold hover:bg-white dark:border-slate-700 dark:bg-slate-900">🤖 ML Models</Link>
        </div>
      </motion.div>

      {/* Stats bar */}
      {isLoading && !stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "จังหวัดที่ติดตาม", value: stats.provinces.toString(), suffix: " จังหวัด", sub: `อัปเดต ${stats.updatedAt}` },
            { label: "PM2.5 เฉลี่ย", value: stats.avg.toFixed(1), suffix: " μg/m³", sub: riskLabel(stats.avg), color: pm25Color(stats.avg) },
            { label: "พื้นที่เสี่ยงสูง", value: stats.hazardous.toString(), suffix: " จังหวัด", sub: "PM2.5 > 55.4 μg/m³" },
            { label: "จุดความร้อนรวม", value: stats.totalHotspots.toString(), suffix: " จุด", sub: "NASA FIRMS" },
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
            >
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1.5 text-2xl font-bold" style={item.color ? { color: item.color } : {}}>
                {item.value}<span className="text-sm font-normal text-slate-500">{item.suffix}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">{item.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Region overview */}
      {regionStats.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold">ภาพรวมรายภาค</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {regionStats.map((r, i) => (
              <motion.div
                key={r.region}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 + i * 0.04 }}
                className="flex flex-col items-center rounded-xl border border-slate-200 bg-white/80 p-3 text-center dark:border-slate-700 dark:bg-slate-900/70"
              >
                <p className="text-xs font-medium text-slate-500">{r.label}</p>
                <p className="mt-1 text-xl font-extrabold" style={{ color: pm25Color(r.avg) }}>{r.avg.toFixed(1)}</p>
                <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${riskBg(r.avg)}`}>
                  {riskLabel(r.avg)}
                </span>
                <p className="mt-0.5 text-[10px] text-slate-400">{r.count} จังหวัด</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Worst provinces */}
      {worstProvinces.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold">จังหวัดเสี่ยงสูงสุด 6 อันดับ</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {worstProvinces.map((p, i) => (
              <ProvinceSummaryCard key={p.slug} province={p} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Navigation cards */}
      <div>
        <h2 className="mb-3 text-lg font-bold">ฟีเจอร์ทั้งหมด</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {NAV_CARDS.map((card, i) => (
            <motion.div
              key={card.href}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <Link
                href={card.href}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:shadow-md hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-900/70"
              >
                <span className="text-2xl">{card.icon}</span>
                <div>
                  <p className="font-semibold">{card.title}</p>
                  <p className="text-xs text-slate-500">{card.desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Data sources */}
      <div className="rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <h3 className="mb-2 text-sm font-semibold">แหล่งข้อมูล</h3>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
          {["Open-Meteo Air Quality API", "OpenAQ v3", "Air4Thai (กรมควบคุมมลพิษ)", "Open-Meteo Weather", "NASA FIRMS Fire Hotspot", "IQAir API"].map((s) => (
            <span key={s} className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 dark:border-slate-600 dark:bg-slate-800">{s}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
