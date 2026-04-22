"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type StatsCardProps = {
  title: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "warn" | "danger";
};

const toneStyles: Record<NonNullable<StatsCardProps["tone"]>, string> = {
  neutral: "from-sky-500/20 to-indigo-500/10 border-sky-200/40 dark:border-sky-600/40",
  good: "from-emerald-500/25 to-cyan-400/10 border-emerald-200/40 dark:border-emerald-600/40",
  warn: "from-amber-500/25 to-orange-500/10 border-amber-200/40 dark:border-amber-600/40",
  danger: "from-red-500/25 to-fuchsia-500/10 border-red-200/40 dark:border-red-600/40",
};

export function StatsCard({ title, value, hint, tone = "neutral" }: StatsCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "rounded-2xl border bg-gradient-to-br p-4 shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:shadow-black/20",
        toneStyles[tone],
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{hint}</p>
    </motion.article>
  );
}
