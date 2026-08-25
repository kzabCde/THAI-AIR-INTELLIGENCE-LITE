"use client";

import { Megaphone, ChevronRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export function AnnouncementBanner({
  maxAqi = 0,
  worstProvinceName = "",
}: {
  maxAqi?: number;
  worstProvinceName?: string;
}) {
  const hasAlert = maxAqi > 100;

  if (!hasAlert) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-emerald-700 dark:text-emerald-300 text-xs">
                ข่าว / ประกาศสำคัญ
              </span>
            </div>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              ไม่มีประกาศแจ้งเตือนฝุ่นในขณะนี้ คุณภาพอากาศในพื้นที่ภาคอีสานอยู่ในเกณฑ์ปลอดภัย
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-amber-500/10 to-surface-1 p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-xs">
            <Megaphone size={18} className="animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-red-600 dark:text-red-400 text-xs uppercase tracking-wider">
                ข่าว / ประกาศสำคัญ
              </span>
            </div>
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              แจ้งเตือนฝุ่น PM2.5 ในพื้นที่ {worstProvinceName} (AQI {maxAqi}) โปรดสวมหน้ากาก N95 เมื่อออกนอกอาคาร
            </p>
          </div>
        </div>

        <Link
          href="/forecast"
          className="inline-flex items-center gap-1 rounded-xl bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 shadow-xs hover:bg-zinc-100"
        >
          ดูรายละเอียด
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
