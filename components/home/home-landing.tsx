"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { useThailandSnapshot } from "@/lib/hooks/use-thailand-snapshot";

export function HomeLanding() {
  const { data } = useThailandSnapshot();
  const rows = data?.data ?? [];

  const stats = useMemo(() => {
    const ranked = [...rows].sort((a, b) => b.air.pm25 - a.air.pm25);
    const avg = ranked.length ? ranked.reduce((sum, x) => sum + x.air.pm25, 0) / ranked.length : 0;
    return {
      provinces: ranked.length,
      avg,
      worst: ranked[0]?.province_name_th ?? "-",
      updatedAt: data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("th-TH") : "--:--:--",
    };
  }, [data?.updatedAt, rows]);

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-white/30 bg-gradient-to-br from-sky-500/20 via-cyan-300/10 to-indigo-600/20 p-8 shadow-xl backdrop-blur dark:border-white/10">
        <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">ประเทศไทย AI คุณภาพอากาศอัจฉริยะ</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight md:text-5xl">แพลตฟอร์มวิเคราะห์ PM2.5 ครบทุกจังหวัด แบบเรียลไทม์</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-700 dark:text-slate-300 md:text-base">ติดตามคุณภาพอากาศ วิเคราะห์แนวโน้ม และเปรียบเทียบความเสี่ยงรายจังหวัดด้วยโมเดล AI สำหรับประเทศไทยทั้ง 77 จังหวัด.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/map" className="rounded-2xl bg-sky-600 px-5 py-2 font-medium text-white hover:bg-sky-700">ดูแผนที่</Link>
          <Link href="/compare" className="rounded-2xl border border-slate-300 bg-white/80 px-5 py-2 font-medium hover:bg-white dark:border-slate-700 dark:bg-slate-900">เปรียบเทียบ</Link>
          <Link href="/analytics" className="rounded-2xl border border-slate-300 bg-white/80 px-5 py-2 font-medium hover:bg-white dark:border-slate-700 dark:bg-slate-900">วิเคราะห์</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[{ label: "อัปเดตสด 77 จังหวัด", value: stats.provinces, suffix: " จังหวัด" }, { label: "PM2.5 เฉลี่ยประเทศ", value: stats.avg.toFixed(1), suffix: " μg/m³" }, { label: "จังหวัดเสี่ยงสูงสุด", value: stats.worst, suffix: "" }].map((item, idx) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }} className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{item.value}{item.suffix}</p>
            <p className="mt-1 text-xs text-slate-500">อัปเดตล่าสุด {stats.updatedAt} น.</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
