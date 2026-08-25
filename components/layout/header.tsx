"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LiveClock } from "@/components/ui/live-clock";
import { LiveStatus } from "@/components/realtime/live-status";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-[1000] border-b border-border bg-[rgb(var(--surface))]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 sm:h-18 max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 group">
          <Image
            src="/images/cloud-logo.png"
            alt="Isan Air Intelligence"
            width={48}
            height={48}
            unoptimized
            className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 object-contain transition-transform duration-200 group-hover:scale-105"
            priority
          />
          <span className="min-w-0">
            <span className="block truncate text-base sm:text-lg font-black tracking-tight leading-tight transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
              Isan Air Intelligence
            </span>
            <span className="muted block text-[11px] sm:text-xs leading-tight">
              คุณภาพอากาศ 20 จังหวัดภาคอีสาน
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  active ? "bg-brand text-white" : "muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium tabular-nums sm:inline-flex">
            <Clock size={13} className="muted" />
            <LiveClock withDate />
          </span>
          <LiveStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
