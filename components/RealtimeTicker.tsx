"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProvinceSnapshot } from "@/types/air";
import { formatThaiTime } from "@/lib/formatThai";

type RealtimeTickerProps = {
  updatedAt: Date;
  rows?: ProvinceSnapshot[];
};

export function RealtimeTicker({ updatedAt, rows = [] }: RealtimeTickerProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const movers = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b.predicted_pm25 - a.predicted_pm25).slice(0, 2);
    return sorted.map((x, idx) => `${x.province_name_th} ${idx === 0 ? "+" : "-"}${Math.abs(x.predicted_pm25 - x.air.pm25).toFixed(0)}`);
  }, [rows]);

  return (
    <div className="rounded-xl border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/40 dark:text-emerald-100">
      <p className="flex items-center gap-2 font-medium">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
        🟢 สดล่าสุด {formatThaiTime(updatedAt)}
      </p>
      <p className="text-xs opacity-80">เวลาปัจจุบัน {formatThaiTime(now)} น.</p>
      {movers.length > 0 && <p className="mt-1 text-xs">{movers.join(" • ")}</p>}
    </div>
  );
}
