"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, Database, LineChart, MapPinned, Radar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const features = [
  { title: "Real-time Air Monitoring", icon: Activity },
  { title: "77 จังหวัดทั่วประเทศไทย", icon: MapPinned },
  { title: "Smart Risk Analysis", icon: AlertTriangle },
  { title: "Forecast & Trend", icon: LineChart },
  { title: "Multi-source Fallback", icon: Database },
  { title: "Local-first Demo Mode", icon: Radar },
];

const kpis = [
  { label: "PM2.5", value: "32 µg/m³", tone: "text-amber-500" },
  { label: "PM10", value: "58 µg/m³", tone: "text-orange-500" },
  { label: "AQI", value: "112", tone: "text-rose-500" },
  { label: "Risk Level", value: "Moderate", tone: "text-yellow-500" },
];

export function LandingPage() {
  return (
    <div className="space-y-8 pb-8">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-white/30 bg-gradient-to-br from-cyan-100/60 via-white/70 to-indigo-100/60 p-8 dark:border-slate-700 dark:from-cyan-950/40 dark:via-slate-900/80 dark:to-indigo-950/30">
        <p className="text-sm font-medium text-sky-600 dark:text-sky-400">ระบบวิเคราะห์คุณภาพอากาศอัจฉริยะ</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-5xl">Thailand Air Intelligence</h1>
        <p className="mt-4 max-w-3xl text-slate-600 dark:text-slate-300">ติดตาม PM2.5 / PM10 / AQI แบบเรียลไทม์ ครอบคลุม 77 จังหวัด พร้อมการวิเคราะห์ความเสี่ยงและระบบ fallback จากหลายแหล่งข้อมูล</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard"><Button>เข้าสู่แดชบอร์ด</Button></Link>
          <Link href="/sources"><Button className="bg-transparent dark:bg-transparent">ดูแหล่งข้อมูล</Button></Link>
        </div>
      </motion.section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <motion.div key={feature.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card>
                <div className="mb-3 inline-flex rounded-xl bg-sky-100 p-2 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300"><Icon className="h-4 w-4" /></div>
                <h3 className="font-semibold">{feature.title}</h3>
              </Card>
            </motion.div>
          );
        })}
      </section>

      <Card>
        <h2 className="text-xl font-semibold">How it works</h2>
        <p className="mt-4 rounded-xl bg-slate-100/70 p-4 text-sm dark:bg-slate-800/70">Open-Meteo → WAQI → Air4Thai/PCD → OpenAQ → Cache/Demo</p>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">คุณค่าของงานวิจัย (Thesis Value)</h2>
        <ul className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          <li>• data transparency ที่ตรวจสอบแหล่งข้อมูลได้</li>
          <li>• fallback architecture ลดความเสี่ยงข้อมูลขาดช่วง</li>
          <li>• risk intelligence มากกว่าแดชบอร์ดค่าฝุ่นทั่วไป</li>
          <li>• province-level monitoring ทั้ง 77 จังหวัด</li>
          <li>• forecast support สำหรับการวางแผนล่วงหน้า</li>
        </ul>
      </Card>

      <Card className="bg-gradient-to-br from-white/80 to-violet-50/70 dark:from-slate-900/90 dark:to-slate-800/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Dashboard Preview (Mock)</h2>
          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300">Source: Cache/Demo</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-white/40 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/70">
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <p className={`mt-2 text-2xl font-bold ${kpi.tone}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
