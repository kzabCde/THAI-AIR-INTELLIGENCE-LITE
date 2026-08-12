"use client";

import { Activity, ShieldAlert, DoorClosed, Users } from "lucide-react";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";

export function HealthAdviceGrid({
  pm25 = 0,
  aqi = 0,
}: {
  pm25?: number;
  aqi?: number;
}) {
  const band = aqi ? bandForAqi(aqi) : bandForPm25(pm25);

  // Dynamic Real Health Recommendation Engine based on Live Supabase AQI
  type AdviceItem = { title: string; status: string; color: string };
  let items: AdviceItem[];

  if (aqi > 150) {
    items = [
      { title: "ออกกำลังกาย", status: "งดกิจกรรมกลางแจ้ง", color: "#e11d48" },
      { title: "สวมหน้ากาก N95", status: "ต้องสวม N95", color: "#e11d48" },
      { title: "เปิดหน้าต่าง", status: "ไม่แนะนำ (ปิดมิดชิด)", color: "#e11d48" },
      { title: "เด็กและผู้สูงอายุ", status: "งดให้อยู่นอกอาคาร", color: "#e11d48" },
    ];
  } else if (aqi > 100) {
    items = [
      { title: "ออกกำลังกาย", status: "ไม่แนะนำ", color: "#ea580c" },
      { title: "สวมหน้ากาก N95", status: "แนะนำ N95", color: "#ea580c" },
      { title: "เปิดหน้าต่าง", status: "ไม่แนะนำ", color: "#ea580c" },
      { title: "เด็กและผู้สูงอายุ", status: "หลีกเลี่ยงกลางแจ้ง", color: "#ea580c" },
    ];
  } else if (aqi > 50) {
    items = [
      { title: "ออกกำลังกาย", status: "ทำได้ (ลดเวลา)", color: "#ca8a04" },
      { title: "สวมหน้ากาก N95", status: "แนะนำ", color: "#ca8a04" },
      { title: "เปิดหน้าต่าง", status: "ไม่แนะนำ", color: "#ea580c" },
      { title: "เด็กและผู้สูงอายุ", status: "ควรระวัง", color: "#ca8a04" },
    ];
  } else {
    items = [
      { title: "ออกกำลังกาย", status: "ทำได้", color: "#16a34a" },
      { title: "สวมหน้ากาก N95", status: "ไม่จำเป็น", color: "#16a34a" },
      { title: "เปิดหน้าต่าง", status: "ทำได้", color: "#16a34a" },
      { title: "เด็กและผู้สูงอายุ", status: "ทำได้ปกติ", color: "#16a34a" },
    ];
  }

  const icons = [Activity, ShieldAlert, DoorClosed, Users];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white">คำแนะนำสำหรับวันนี้</h3>
        <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">ประเมินตาม AQI {aqi} ({band.labelTh})</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {items.map((item, idx) => {
          const Icon = icons[idx];
          return (
            <div
              key={idx}
              className="flex items-center justify-start gap-2.5 rounded-2xl border border-zinc-100 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* Translucent circle icon */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: `${item.color}12`,
                  border: `1.5px solid ${item.color}25`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color: item.color }} />
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-black text-zinc-900 dark:text-white truncate">{item.title}</span>
                <span
                  className="block text-[10px] font-extrabold truncate"
                  style={{ color: item.color }}
                >
                  {item.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
