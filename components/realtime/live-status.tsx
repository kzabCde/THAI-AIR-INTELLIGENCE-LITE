"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtRelativeTh } from "@/lib/format";
import { useUiStore } from "@/stores/ui-store";

const DOT: Record<string, string> = {
  live: "bg-emerald-500",
  connecting: "bg-amber-500",
  offline: "bg-red-500",
  disabled: "bg-slate-400",
};
const LABEL: Record<string, string> = {
  live: "เรียลไทม์",
  connecting: "กำลังเชื่อมต่อ",
  offline: "ขาดการเชื่อมต่อ",
  disabled: "ปิดเรียลไทม์",
};

/** Compact realtime indicator + auto-refresh toggle for the header. */
export function LiveStatus() {
  const status = useUiStore((s) => s.realtimeStatus);
  const lastEventAt = useUiStore((s) => s.lastEventAt);
  const autoRefresh = useUiStore((s) => s.autoRefresh);
  const toggleAutoRefresh = useUiStore((s) => s.toggleAutoRefresh);
  const [, force] = useState(0);

  // Re-render every 30s so the relative timestamp stays fresh.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={toggleAutoRefresh}
      title={autoRefresh ? "ปิดการอัปเดตอัตโนมัติ" : "เปิดการอัปเดตอัตโนมัติ"}
      className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2 sm:inline-flex"
    >
      <span className={cn("h-2 w-2 rounded-full", autoRefresh ? DOT[status] : "bg-slate-400")}>
        {autoRefresh && status === "live" && (
          <span className={cn("block h-2 w-2 animate-ping rounded-full", DOT[status])} />
        )}
      </span>
      <span className="muted">
        {autoRefresh ? LABEL[status] : "หยุดชั่วคราว"}
        {lastEventAt ? ` · ${fmtRelativeTh(new Date(lastEventAt).toISOString())}` : ""}
      </span>
    </button>
  );
}
