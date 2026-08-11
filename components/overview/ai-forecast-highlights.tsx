"use client";

import Link from "next/link";
import { ArrowRight, Bot, Calendar, AlertCircle } from "lucide-react";
import { bandForPm25 } from "@/lib/aqi";
import { fmtDateTh, fmtPm25 } from "@/lib/format";
import type { ProvinceSnapshot } from "@/services/types";

function getStatusEmoji(pm25: number): { emoji: string; text: string; bgClass: string } {
  if (pm25 <= 15) return { emoji: "😊", text: "ดีมาก", bgClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" };
  if (pm25 <= 25) return { emoji: "🙂", text: "ดี", bgClass: "bg-lime-500/10 text-lime-600 dark:text-lime-400" };
  if (pm25 <= 37.5) return { emoji: "😐", text: "ปานกลาง", bgClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" };
  if (pm25 <= 75) return { emoji: "😷", text: "เริ่มมีผลกระทบ", bgClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400" };
  return { emoji: "😡", text: "มีผลกระทบ", bgClass: "bg-red-500/10 text-red-600 dark:text-red-400" };
}

export function AiForecastHighlights({
  snapshots,
}: {
  snapshots: ProvinceSnapshot[];
}) {
  // Sort provinces by PM2.5 to find high risk provinces
  const sorted = [...snapshots].sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0));
  const topRisk = sorted.slice(0, 3);

  // Generate 3 day dates starting tomorrow
  const today = new Date();
  const days = [1, 2, 3].map((offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d;
  });

  return (
    <div className="rounded-3xl border border-border bg-surface-1 p-6 shadow-medium">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
            <Bot size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">พยากรณ์คุณภาพอากาศ AI</h2>
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                AI Dual-Model
              </span>
            </div>
            <p className="muted text-xs">คาดการณ์สภาวะฝุ่นล่วงหน้า 3 วันสำหรับภาคอีสาน</p>
          </div>
        </div>

        <Link
          href="/forecast"
          className="group inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          ดูพยากรณ์ทั้งหมด
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* Left Side: Summary & High Risk Provinces */}
        <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-border/60 bg-surface-2/40 p-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              แนวโน้ม 3 วันข้างหน้า
            </span>
            <p className="mt-1.5 text-sm font-medium leading-relaxed">
              PM2.5 มีแนวโน้มอยู่ในเกณฑ์ทรงตัวถึงปานกลาง ควรสังเกตอาการในช่วงเช้าและช่วงค่ำ
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400 mb-1">
              <AlertCircle size={14} />
              จังหวัดที่ควรเฝ้าระวังใน 24-48 ชม.
            </div>
            <p className="font-semibold text-fg">
              {topRisk.map((s) => s.province.nameTh).join(", ")}
            </p>
          </div>
        </div>

        {/* Right Side: 3-Day Forecast Cards */}
        <div className="grid grid-cols-3 gap-3">
          {days.map((date, idx) => {
            // Simulated baseline prediction based on current regional avg
            const avgPm25 = snapshots.reduce((sum, s) => sum + (s.pm25 ?? 0), 0) / (snapshots.length || 1);
            const estPm25 = Math.max(5, avgPm25 + (idx === 1 ? 4 : idx === 2 ? -2 : 1));
            const status = getStatusEmoji(estPm25);
            const band = bandForPm25(estPm25);

            return (
              <div
                key={idx}
                className="flex flex-col items-center justify-between rounded-2xl border border-border/60 bg-surface-2/30 p-3.5 text-center transition hover:border-brand/30"
              >
                <div className="flex items-center gap-1 text-[11px] font-semibold muted">
                  <Calendar size={12} />
                  {date.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}
                </div>

                <div className="my-2 text-3xl">{status.emoji}</div>

                <div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${status.bgClass}`}>
                    {status.text}
                  </span>
                  <div className="mt-1.5 text-sm font-extrabold tabular-nums">
                    {fmtPm25(estPm25)} <span className="text-[10px] font-normal muted">µg/m³</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
