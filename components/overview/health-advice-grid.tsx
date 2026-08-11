"use client";

import { Activity, ShieldAlert, DoorClosed, Users } from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";

export function HealthAdviceGrid({
  pm25 = 27,
  aqi = 68,
}: {
  pm25?: number;
  aqi?: number;
}) {
  const band = aqi ? bandForAqi(aqi) : bandForPm25(pm25);

  // Dynamic Real Health Recommendation Engine based on Live Supabase AQI
  let exercise = { text: "ทำได้", color: "text-emerald-600 dark:text-emerald-400 font-extrabold", bg: "bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-700/50" };
  let mask = { text: "ไม่จำเป็น", color: "text-emerald-600 dark:text-emerald-400 font-extrabold", bg: "bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-700/50" };
  let windowStatus = { text: "ทำได้", color: "text-emerald-600 dark:text-emerald-400 font-extrabold", bg: "bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-700/50" };
  let sensitive = { text: "ทำได้ปกติ", color: "text-emerald-600 dark:text-emerald-400 font-extrabold", bg: "bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-700/50" };

  if (aqi > 150) {
    exercise = { text: "งดกิจกรรมกลางแจ้ง", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
    mask = { text: "ต้องสวม N95", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
    windowStatus = { text: "ไม่แนะนำ (ปิดมิดชิด)", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
    sensitive = { text: "งดให้อยู่นอกอาคาร", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
  } else if (aqi > 100) {
    exercise = { text: "ไม่แนะนำ", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
    mask = { text: "แนะนำ N95", color: "text-orange-600 dark:text-orange-400 font-extrabold", bg: "bg-orange-50/60 dark:bg-orange-950/40 border-orange-200/60 dark:border-orange-700/50" };
    windowStatus = { text: "ไม่แนะนำ", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
    sensitive = { text: "หลีกเลี่ยงกลางแจ้ง", color: "text-orange-600 dark:text-orange-400 font-extrabold", bg: "bg-orange-50/60 dark:bg-orange-950/40 border-orange-200/60 dark:border-orange-700/50" };
  } else if (aqi > 50) {
    exercise = { text: "ทำได้ (ลดเวลา)", color: "text-amber-600 dark:text-amber-400 font-extrabold", bg: "bg-amber-50/60 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-700/50" };
    mask = { text: "แนะนำ", color: "text-emerald-600 dark:text-emerald-400 font-extrabold", bg: "bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-700/50" };
    windowStatus = { text: "ไม่แนะนำ", color: "text-rose-600 dark:text-rose-400 font-extrabold", bg: "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-700/50" };
    sensitive = { text: "ควรระวัง", color: "text-amber-600 dark:text-amber-400 font-extrabold", bg: "bg-amber-50/60 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-700/50" };
  }

  const items = [
    {
      icon: <Activity size={18} className="text-emerald-500 dark:text-emerald-400 shrink-0" />,
      title: "ออกกำลังกาย",
      status: exercise.text,
      colorClass: exercise.color,
      bgClass: exercise.bg,
    },
    {
      icon: <ShieldAlert size={18} className="text-emerald-500 dark:text-emerald-400 shrink-0" />,
      title: "สวมหน้ากาก N95",
      status: mask.text,
      colorClass: mask.color,
      bgClass: mask.bg,
    },
    {
      icon: <DoorClosed size={18} className="text-rose-500 dark:text-rose-400 shrink-0" />,
      title: "เปิดหน้าต่าง",
      status: windowStatus.text,
      colorClass: windowStatus.color,
      bgClass: windowStatus.bg,
    },
    {
      icon: <Users size={18} className="text-orange-500 dark:text-orange-400 shrink-0" />,
      title: "เด็กและผู้สูงอายุ",
      status: sensitive.text,
      colorClass: sensitive.color,
      bgClass: sensitive.bg,
    },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white">คำแนะนำสำหรับวันนี้</h3>
        <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">ประเมินตาม AQI {aqi} ({band.labelTh})</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-start gap-2.5 rounded-2xl border p-3 shadow-xs ${item.bgClass}`}
          >
            {item.icon}
            <div className="min-w-0">
              <span className="block text-[11px] font-black text-zinc-900 dark:text-white truncate">{item.title}</span>
              <span className={`block text-[10px] ${item.colorClass} truncate`}>{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
