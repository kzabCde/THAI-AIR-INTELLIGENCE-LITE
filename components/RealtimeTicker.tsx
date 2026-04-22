"use client";

import { useEffect, useState } from "react";
import { formatThaiTime } from "@/lib/formatThai";

type RealtimeTickerProps = {
  updatedAt: Date;
};

export function RealtimeTicker({ updatedAt }: RealtimeTickerProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rounded-xl border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/40 dark:text-emerald-100">
      <p className="flex items-center gap-2 font-medium">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
        อัปเดตสดล่าสุด {formatThaiTime(updatedAt)} น.
      </p>
      <p className="text-xs opacity-80">เวลาปัจจุบัน {formatThaiTime(now)} น.</p>
    </div>
  );
}
