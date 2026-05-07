"use client";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export function PagePlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="bg-gradient-to-br from-white/80 to-sky-50/60 dark:from-slate-900/80 dark:to-slate-800/40">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{subtitle}</p>
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300/70 p-10 text-center text-slate-500 dark:border-slate-600 dark:text-slate-400">Coming soon — กำลังพัฒนาโมดูลนี้</div>
      </Card>
    </motion.section>
  );
}
