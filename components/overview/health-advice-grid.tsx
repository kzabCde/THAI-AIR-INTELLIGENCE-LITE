"use client";

import { Activity, Users, ShieldAlert, DoorClosed } from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";

type AdviceItem = {
  title: string;
  desc: string;
  color: string;
  icon: typeof Activity;
};

function getAdviceItems(aqi: number): AdviceItem[] {
  if (aqi > 150) {
    return [
      { icon: Activity, title: "คนทั่วไป", desc: "งดกิจกรรมกลางแจ้ง สวมหน้ากาก N95 ทุกครั้งที่ออกนอกอาคาร", color: "#e11d48" },
      { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "งดให้อยู่นอกอาคาร ใช้เครื่องฟอกอากาศในห้อง", color: "#e11d48" },
      { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "ต้องสวมหน้ากาก N95 ทุกครั้งที่ออกนอกอาคาร", color: "#e11d48" },
      { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "ไม่แนะนำ ปิดมิดชิดตลอดเวลา", color: "#e11d48" },
    ];
  }
  if (aqi > 100) {
    return [
      { icon: Activity, title: "คนทั่วไป", desc: "หลีกเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากากเมื่อออกนอกอาคาร", color: "#ea580c" },
      { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "หลีกเลี่ยงกิจกรรมกลางแจ้ง แนะนำสวมหน้ากาก N95", color: "#ea580c" },
      { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "แนะนำให้สวมหน้ากาก N95 เมื่ออยู่กลางแจ้ง", color: "#ea580c" },
      { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "ไม่แนะนำ ลดการเปิดหน้าต่างให้มากที่สุด", color: "#ea580c" },
    ];
  }
  if (aqi > 50) {
    return [
      { icon: Activity, title: "คนทั่วไป", desc: "สามารถทำกิจกรรมกลางแจ้งได้ แต่ควรลดเวลาลงบ้าง", color: "#ca8a04" },
      { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "ลดกิจกรรมกลางแจ้ง แนะนำสวมหน้ากาก", color: "#ca8a04" },
      { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "แนะนำให้สวมหน้ากากเมื่ออยู่กลางแจ้งเป็นเวลานาน", color: "#ca8a04" },
      { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "ลดการเปิดหน้าต่าง เลี่ยงช่วงฝุ่นสูง", color: "#ca8a04" },
    ];
  }
  return [
    { icon: Activity, title: "คนทั่วไป", desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ", color: "#16a34a" },
    { icon: Users, title: "เด็ก ผู้สูงอายุ และผู้ที่มีโรคประจำตัว", desc: "สามารถทำกิจกรรมกลางแจ้งได้ตามปกติ", color: "#16a34a" },
    { icon: ShieldAlert, title: "ควรสวมหน้ากาก", desc: "ไม่จำเป็นต้องสวมหน้ากาก N95", color: "#16a34a" },
    { icon: DoorClosed, title: "การเปิดหน้าต่าง", desc: "สามารถเปิดให้อากาศถ่ายเทได้ตามปกติ", color: "#16a34a" },
  ];
}

export function HealthAdviceGrid({
  pm25 = 0,
  aqi = 0,
}: {
  pm25?: number;
  aqi?: number;
}) {
  const band = aqi ? bandForAqi(aqi) : bandForPm25(pm25);
  const items = getAdviceItems(aqi);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white">คำแนะนำสุขภาพ</h3>
        <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
          ประเมินตาม AQI {aqi} ({band.labelTh})
        </span>
      </div>

      <div className="rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: `${item.color}12`,
                    border: `1.5px solid ${item.color}25`,
                  }}
                >
                  <Icon className="h-4 w-4" style={{ color: item.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                    {item.title}
                  </p>
                  <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
