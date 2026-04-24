"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Activity,
  MapPinned,
  BarChart3,
  GitCompareArrows,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/dashboard", label: "แดชบอร์ด", icon: Activity },
  { href: "/map", label: "แผนที่สด", icon: MapPinned },
  { href: "/compare", label: "เปรียบเทียบ", icon: GitCompareArrows },
  { href: "/analytics", label: "วิเคราะห์", icon: BarChart3 },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-3 left-3 right-3 z-50 md:hidden">
      <div className="mx-auto max-w-lg rounded-3xl border border-white/30 bg-white/80 p-2 shadow-2xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/80">

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium transition-all duration-200",
                  active
                    ? "bg-sky-500 text-white shadow-lg"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <Icon size={18} className="mb-1" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

      </div>
    </nav>
  );
}