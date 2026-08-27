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
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white/80 p-3.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
          <CheckCircle2 size={16} className="text-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
            ข่าว / ประกาศ
          </span>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            ไม่มีประกาศแจ้งเตือนฝุ่น — อากาศอยู่ในเกณฑ์ปลอดภัย
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <Megaphone size={16} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
            แจ้งเตือนฝุ่น PM2.5
          </span>
          <p className="mt-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            พื้นที่ {worstProvinceName} (AQI {maxAqi}) — สวมหน้ากาก N95 เมื่อออกนอกอาคาร
          </p>
        </div>
      </div>

      <Link
        href="/forecast"
        className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        ดูรายละเอียด
        <ChevronRight size={12} />
      </Link>
    </div>
  );
}
