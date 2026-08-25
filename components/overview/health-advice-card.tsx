"use client";

import { UserCheck, ShieldAlert, ShieldCheck, DoorOpen } from "lucide-react";
import { bandForPm25 } from "@/lib/aqi";

export function HealthAdviceCard({ avgPm25 = 27 }: { avgPm25?: number }) {
  const band = bandForPm25(avgPm25);

  const items = [
    {
      icon: <UserCheck size={18} className="text-emerald-500" />,
      title: "คนทั่วไป",
      desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ",
    },
    {
      icon: <ShieldAlert size={18} className="text-amber-500" />,
      title: "เด็ก ผู้สูงอายุ และผู้มีโรคประจำตัว",
      desc: "ควรลดกิจกรรมหนัก และสวมหน้ากากหากจำเป็น",
    },
    {
      icon: <ShieldCheck size={18} className="text-blue-500" />,
      title: "ควรสวมหน้ากาก",
      desc: "แนะนำให้สวมหน้ากาก N95 เมื่อออกนอกบ้าน",
    },
    {
      icon: <DoorOpen size={18} className="text-teal-500" />,
      title: "การเปิดหน้าต่าง",
      desc: "สามารถเปิดได้ แต่ไม่ควรเปิดเป็นเวลานาน",
    },
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface-1 p-6 shadow-medium flex flex-col justify-between">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight">คำแนะนำสุขภาพ</h3>
          <p className="muted text-xs">คำแนะนำการปฏิบัติตนตามระดับคุณภาพอากาศ ({band.labelTh})</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl">
          😷
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 rounded-2xl border border-border/50 bg-surface-2/30 p-3 transition hover:bg-surface-2/70"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-1 shadow-xs mt-0.5">
              {item.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-fg">{item.title}</p>
              <p className="muted text-[11px] leading-snug mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
