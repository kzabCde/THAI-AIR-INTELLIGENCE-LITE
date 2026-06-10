import { riskBg, riskLabel } from "@/lib/colors";

export function RiskBadge({ pm25, className = "" }: { pm25: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskBg(pm25)} ${className}`}>
      {riskLabel(pm25)} ({pm25.toFixed(1)} μg/m³)
    </span>
  );
}
