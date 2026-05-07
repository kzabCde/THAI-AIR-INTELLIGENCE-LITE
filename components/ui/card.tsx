import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/20 bg-white/60 p-6 shadow-lg shadow-slate-200/40 backdrop-blur dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-black/20",
        className,
      )}
      {...props}
    />
  );
}
