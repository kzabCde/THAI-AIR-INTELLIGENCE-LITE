"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      <div className="sticky top-6 rounded-3xl border border-white/30 bg-white/70 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
        <p className="mb-4 px-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Thailand Air Intelligence</p>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition", active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}>
                <Icon className="h-4 w-4" />{item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
