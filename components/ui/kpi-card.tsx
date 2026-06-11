import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  unit,
  hint,
  icon,
  delta,
  accent,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  icon?: ReactNode;
  /** Positive = worse (PM2.5 up). Renders a colored trend pill. */
  delta?: number | null;
  accent?: string; // hex for left accent bar
  className?: string;
}) {
  return (
    <div className={cn("card card-pad relative overflow-hidden", className)}>
      {accent && (
        <span
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="section-title">{label}</p>
        {icon && <span className="muted">{icon}</span>}
      </div>
      <p className="stat-value mt-2">
        {value}
        {unit && <span className="ml-1 text-base font-medium muted">{unit}</span>}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {delta != null && <DeltaPill delta={delta} />}
        {hint && <p className="muted text-xs">{hint}</p>}
      </div>
    </div>
  );
}

export function DeltaPill({ delta, suffix = "µg/m³" }: { delta: number; suffix?: string }) {
  const up = delta > 0.5;
  const down = delta < -0.5;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const cls = up
    ? "text-red-600 bg-red-500/10 dark:text-red-300"
    : down
      ? "text-emerald-600 bg-emerald-500/10 dark:text-emerald-300"
      : "muted bg-surface-2";
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold", cls)}>
      <Icon size={12} />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)} {suffix}
    </span>
  );
}
