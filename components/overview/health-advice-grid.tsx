"use client";

import { Activity, HeartHandshake, ShieldCheck, DoorOpen } from "lucide-react";
import { bandForPm25 } from "@/lib/aqi";

export function HealthAdviceGrid({ avgPm25 }: { avgPm25: number }) {
  const band = bandForPm25(avgPm25);

  const isGood = avgPm25 <= 25;
  const isModerate = avgPm25 > 25 && avgPm25 <= 37.5;
  const isUnhealthy = avgPm25 > 37.5;

  const items = [
    {
      icon: <Activity size={22} className="text-emerald-500" />,
      title: "ออกกำลังกายกลางแจ้ง",
      status: isGood ? "ทำได้ตามปกติ" : isModerate ? "ควรสังเกตอาการ" : "ควรงดออกกำลังกาย",
      badgeClass: isGood
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : isModerate
        ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
      icon: <ShieldCheck size={22} className="text-blue-500" />,
      title: "สวมหน้ากาก N95",
      status: isGood ? "ไม่จำเป็น" : isModerate ? "แนะนำสำหรับกลุ่มเสี่ยง" : "แนะนำอย่างยิ่ง",
      badgeClass: isGood
        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
        : "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      icon: <DoorOpen size={22} className="text-amber-500" />,
      title: "เปิดหน้าต่างระบายอากาศ",
      status: isGood ? "ทำได้ตามปกติ" : isModerate ? "ระบายอากาศช่วงสั้นๆ" : "ควรปิดหน้าต่าง",
      badgeClass: isGood
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      icon: <HeartHandshake size={22} className="text-purple-500" />,
      title: "เด็กและผู้สูงอายุ",
      status: isGood ? "ปลอดภัย" : isModerate ? "ควรระวังเป็นพิเศษ" : "อยู่ในอาคาร",
      badgeClass: isGood
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface-1 p-6 shadow-medium">
      <div className="mb-4">
        <h2 className="text-lg font-bold tracking-tight">คำแนะนำสำหรับวันนี้</h2>
        <p className="muted text-xs">ข้อปฏิบัติตามระดับคุณภาพอากาศเฉลี่ยภูมิภาค ({band.labelTh})</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex flex-col items-start justify-between rounded-2xl border border-border/60 bg-surface-2/30 p-4 transition hover:bg-surface-2/60"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 shadow-xs">
              {item.icon}
            </div>
            <div>
              <p className="text-xs font-semibold text-fg">{item.title}</p>
              <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${item.badgeClass}`}>
                {item.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
