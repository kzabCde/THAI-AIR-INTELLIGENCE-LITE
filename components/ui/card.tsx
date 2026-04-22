import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-slate-200/60 bg-white/90 p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900/80", className)}
      {...props}
    />
  );
}
