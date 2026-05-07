"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "@/components/layout/nav-config";

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} className="mb-4 inline-flex rounded-xl border border-white/20 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/80"><Menu className="h-5 w-5" /></button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/50 p-4 backdrop-blur-sm">
            <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} className="h-full max-w-xs rounded-3xl bg-white p-4 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between"><p className="font-semibold">เมนู</p><button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
              <nav className="space-y-2">
                {NAV_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`block rounded-xl px-3 py-2 ${pathname === item.href ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-700 dark:text-slate-200"}`}>{item.label}</Link>
                ))}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
