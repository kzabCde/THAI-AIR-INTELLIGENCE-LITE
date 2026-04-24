"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Menu, X, Activity, MapPinned, BarChart3, Settings, Home, GitCompareArrows } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const provinces = [
  "กรุงเทพมหานคร",
  "นนทบุรี",
  "ปทุมธานี",
  "เชียงใหม่",
  "เชียงราย",
  "ชลบุรี",
  "ระยอง",
  "ขอนแก่น",
  "นครราชสีมา",
  "ภูเก็ต",
  "สงขลา",
  "สุราษฎร์ธานี",
];

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
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    return provinces.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 6);
  }, [query]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/20 bg-white/60 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:border-white/10 dark:bg-slate-950/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">

        {/* Logo */}
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg"
          >
            🇹🇭
          </motion.div>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white md:text-base">
              Thailand Air Intelligence
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              คุณภาพอากาศประเทศไทยแบบสด
            </p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-sky-500 text-white shadow-md"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={16} />
                {item.label}

                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-sky-500"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Search + Status */}
        <div className="hidden items-center gap-3 lg:flex">

          {/* Live Badge */}
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.8 }}
            className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Activity size={14} />
            สดล่าสุด
          </motion.div>

          {/* Search */}
          <div className="relative w-64">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาจังหวัด..."
              className="w-full rounded-full border border-white/40 bg-white/70 py-2 pl-9 pr-4 text-sm outline-none backdrop-blur dark:border-slate-700 dark:bg-slate-900/70"
            />

            <AnimatePresence>
              {filtered.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-12 w-full overflow-hidden rounded-2xl border bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                >
                  {filtered.map((item) => (
                    <button
                      key={item}
                      onClick={() => setQuery(item)}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {item}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile Menu */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-xl border p-2 lg:hidden dark:border-slate-700"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            className="border-t bg-white/90 px-4 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90 lg:hidden"
          >
            <div className="mb-4 rounded-full border bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <input
                placeholder="ค้นหาจังหวัด..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>

            <div className="grid gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}