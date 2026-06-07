"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, MapPinned, Radar, ShieldCheck, Sparkles, Wind } from "lucide-react";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";

const features = [
  { title: "แผนที่ประเทศไทยใหม่", desc: "Air Atlas แบบอินเทอร์แอคทีฟ แสดงจังหวัด สีความเสี่ยง และพื้นที่เฝ้าระวัง", icon: MapPinned },
  { title: "AI Risk Intelligence", desc: "จัดอันดับความเสี่ยง คาดการณ์แนวโน้ม และสรุปภาพรวมให้เข้าใจง่าย", icon: Radar },
  { title: "ข้อมูลสดครบ 77 จังหวัด", desc: "รวมค่าฝุ่นและสภาพแวดล้อมสำหรับการตัดสินใจรายวัน", icon: ShieldCheck },
];

export function HomeLanding() {
  const { data } = useThailandSnapshot();
  const rows = data?.data ?? [];

  const stats = useMemo(() => {
    const ranked = [...rows].sort((a, b) => b.air.pm25 - a.air.pm25);
    const avg = ranked.length ? ranked.reduce((sum, x) => sum + x.air.pm25, 0) / ranked.length : 0;
    const unhealthy = ranked.filter((row) => row.air.pm25 > 75).length;
    return {
      provinces: ranked.length,
      avg,
      unhealthy,
      worst: ranked[0]?.province_name_th ?? "-",
      topFive: ranked.slice(0, 5),
      updatedAt: data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("th-TH") : "--:--:--",
    };
  }, [data?.updatedAt, rows]);

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/72 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55 md:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(14,165,233,0.28),transparent_32%),radial-gradient(circle_at_86%_0%,rgba(16,185,129,0.22),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.62),transparent_52%)] dark:bg-[radial-gradient(circle_at_14%_12%,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_86%_0%,rgba(16,185,129,0.13),transparent_26%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
          <div>
            <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
              <Sparkles size={14} /> Thailand Air Intelligence Lite
            </motion.span>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 max-w-4xl text-4xl font-black leading-tight tracking-tight text-slate-950 dark:text-white md:text-6xl">
              UI ใหม่สำหรับการอ่านค่าฝุ่นประเทศไทย ให้สวย ชัด และเร็วกว่าเดิม
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300 md:text-lg">
              สำรวจ PM2.5 แบบเรียลไทม์จากทุกจังหวัด ผ่านแผนที่ประเทศไทยที่ออกแบบใหม่ พร้อมสรุปภาพรวม ระดับความเสี่ยง และเส้นทางไปยังแดชบอร์ดเชิงวิเคราะห์.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-8 flex flex-wrap gap-3">
              <Link href="/map" className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-6 py-3 font-black text-white shadow-xl shadow-sky-500/25 transition hover:-translate-y-0.5 hover:shadow-2xl">
                ดูแผนที่ใหม่ <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </Link>
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-3 font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-white">
                <BarChart3 size={18} /> แดชบอร์ด
              </Link>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12 }} className="relative min-h-[31rem] overflow-hidden rounded-[2rem] border border-white/55 bg-slate-950 p-5 shadow-2xl shadow-sky-950/30 dark:border-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.36),transparent_34%),radial-gradient(circle_at_80%_12%,rgba(16,185,129,0.24),transparent_30%),linear-gradient(135deg,rgba(8,47,73,0.8),rgba(2,6,23,0.92))]" />
            <div className="relative z-10 flex items-start justify-between gap-4 text-white">
              <div>
                <p className="text-xs font-bold text-cyan-200">National PM2.5 average</p>
                <p className="mt-1 text-4xl font-black">{stats.avg.toFixed(1)}</p>
                <p className="text-sm text-slate-300">μg/m³ · อัปเดต {stats.updatedAt} น.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
                <Wind className="text-cyan-200" />
              </div>
            </div>

            <div className="absolute left-1/2 top-[56%] h-[25rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-[48%_52%_54%_46%] border border-white/50 bg-gradient-to-br from-cyan-100/24 via-emerald-100/20 to-sky-100/24 shadow-[0_30px_80px_rgba(14,165,233,0.25)]" />
            <div className="absolute left-[54%] top-[53%] h-[12rem] w-[9rem] rounded-full border border-white/20 bg-cyan-300/10 blur-xl" />
            {stats.topFive.map((row, index) => (
              <button key={row.slug} className="absolute z-20 rounded-2xl border border-white/15 bg-white/12 px-3 py-2 text-left text-xs text-white shadow-xl backdrop-blur-md transition hover:bg-white/20" style={{ left: [`16%`, `58%`, `28%`, `62%`, `40%`][index], top: [`28%`, `35%`, `51%`, `59%`, `72%`][index] }}>
                <span className="block font-black">{row.province_name_th}</span>
                <span className="text-cyan-100">{row.air.pm25.toFixed(1)} μg/m³</span>
              </button>
            ))}
            <div className="absolute bottom-5 left-5 right-5 z-10 rounded-3xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-md">
              <p className="text-xs font-bold text-slate-300">พื้นที่ต้องเฝ้าระวัง</p>
              <p className="mt-1 text-2xl font-black">{stats.unhealthy} จังหวัด</p>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "ข้อมูลสด", value: stats.provinces, suffix: " จังหวัด" },
          { label: "PM2.5 เฉลี่ยประเทศ", value: stats.avg.toFixed(1), suffix: " μg/m³" },
          { label: "จังหวัดเสี่ยงสูงสุด", value: stats.worst, suffix: "" },
        ].map((item, idx) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }} className="rounded-[1.75rem] border border-white/65 bg-white/78 p-6 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/55">
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{item.value}{item.suffix}</p>
            <p className="mt-2 text-xs font-medium text-slate-500">อัปเดตล่าสุด {stats.updatedAt} น.</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div key={feature.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + index * 0.06 }} className="rounded-[1.75rem] border border-white/65 bg-white/70 p-6 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-500/20">
                <Icon size={22} />
              </div>
              <h2 className="mt-5 text-lg font-black text-slate-950 dark:text-white">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{feature.desc}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
