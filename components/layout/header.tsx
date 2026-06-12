"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Wind } from "lucide-react";
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
    <header className="sticky top-0 z-40 border-b border-border bg-[rgb(var(--surface))]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-soft">
            <Wind size={18} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">
              Isan Air Intelligence
            </span>
            <span className="muted block text-[11px] leading-tight">
              คุณภาพอากาศภาคอีสาน · 20 จังหวัด
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
            <LiveClock />
          </span>
          <LiveStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
