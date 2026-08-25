"use client";

import Link from "next/link";
import { BarChart3, LineChart, Map, Sparkles } from "lucide-react";

export function QuickShortcutsGrid() {
  const shortcuts = [
    {
      title: "แผนที่เต็มจอ",
      desc: "ดูแผนที่ดาวเทียม PM2.5 20 จังหวัด",
      href: "/map",
      icon: <Map size={24} className="text-emerald-500" />,
      bg: "bg-emerald-500/10",
    },
    {
      title: "แนวโน้มย้อนหลัง",
      desc: "กราฟสถิติฝุ่น 7 / 30 / 90 วัน",
      href: "/trends",
      icon: <BarChart3 size={24} className="text-blue-500" />,
      bg: "bg-blue-500/10",
    },
    {
      title: "พยากรณ์ AI",
      desc: "คาดการณ์ฝุ่นล่วงหน้า 168 ชม.",
      href: "/forecast",
      icon: <LineChart size={24} className="text-purple-500" />,
      bg: "bg-purple-500/10",
    },
    {
      title: "วิเคราะห์เชิงลึก",
      desc: "กรองช่วงเวลาและจัดหมวดหมู่",
      href: "/analytics",
      icon: <Sparkles size={24} className="text-amber-500" />,
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface-1 p-6 shadow-medium">
      <div className="mb-4">
        <h2 className="text-lg font-bold tracking-tight">ทางลัดใช้งาน</h2>
        <p className="muted text-xs">เข้าถึงเครื่องมือวิเคราะห์และแผนที่ได้รวดเร็ว</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {shortcuts.map((sc, idx) => (
          <Link
            key={idx}
            href={sc.href}
            className="group flex flex-col justify-between rounded-2xl border border-border/60 bg-surface-2/30 p-4 transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-surface-2 hover:shadow-soft"
          >
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${sc.bg} transition-transform group-hover:scale-105`}>
              {sc.icon}
            </div>
            <div>
              <p className="font-bold text-fg text-sm group-hover:text-brand transition-colors">
                {sc.title}
              </p>
              <p className="muted mt-0.5 text-[11px] leading-snug">{sc.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
