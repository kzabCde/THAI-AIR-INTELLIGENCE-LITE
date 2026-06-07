"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, Activity, MapPinned, BarChart3, Settings, Home, GitCompareArrows, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/dashboard", label: "แดชบอร์ด", icon: Activity },
  { href: "/map", label: "แผนที่สด", icon: MapPinned },
  { href: "/compare", label: "เปรียบเทียบ", icon: GitCompareArrows },
  { href: "/analytics", label: "วิเคราะห์", icon: BarChart3 },
  { href: "/settings", label: "ตั้งค่า", icon: Settings },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3">
      <div className="mx-auto max-w-7xl rounded-[1.75rem] border border-white/55 bg-white/70 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/65">
        <div className="flex min-h-[4.25rem] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <motion.div
              initial={{ scale: 0.9, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-400 to-emerald-400 text-xl text-white shadow-lg shadow-sky-500/25"
            >
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.75),transparent_35%)]" />
              <span className="relative">🇹🇭</span>
            </motion.div>

            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-tight text-slate-950 dark:text-white md:text-base">Thailand Air Intelligence</p>
              <p className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Sparkles size={12} className="text-cyan-500" /> แผนที่ฝุ่น AI สำหรับประเทศไทย
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-2 overflow-hidden rounded-full px-4 py-2.5 text-sm font-semibold transition-all ${
                    active
                      ? "text-white shadow-lg shadow-sky-500/25"
                      : "text-slate-600 hover:bg-white/75 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  }`}
                >
                  {active && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <motion.div
              animate={{ boxShadow: ["0 0 0 0 rgba(16,185,129,0.18)", "0 0 0 8px rgba(16,185,129,0)"] }}
              transition={{ repeat: Infinity, duration: 1.7 }}
              className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live air feed
            </motion.div>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-2xl border border-slate-200/80 bg-white/70 p-2.5 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-900/70" aria-label="เปิดเมนู">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="border-t border-slate-200/60 px-4 py-4 dark:border-slate-800 lg:hidden">
              <div className="grid gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active ? "bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-500/20" : "hover:bg-white/70 dark:hover:bg-white/10"}`}>
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
