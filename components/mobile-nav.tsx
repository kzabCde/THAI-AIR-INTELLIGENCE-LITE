"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cog, Home, ListOrdered, Map, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/map", label: "แผนที่", icon: Map },
  { href: "/analytics", label: "อันดับ", icon: ListOrdered },
  { href: "/compare", label: "จังหวัด", icon: MapPinned },
  { href: "/settings", label: "ตั้งค่า", icon: Cog },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-2 dark:border-slate-700 dark:bg-slate-950/95 md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("flex flex-col items-center rounded-lg px-2 py-1 text-xs", active ? "bg-sky-100 text-sky-700 dark:bg-slate-800 dark:text-sky-300" : "text-slate-500")}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
