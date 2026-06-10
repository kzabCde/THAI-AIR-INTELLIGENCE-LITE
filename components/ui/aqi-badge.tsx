import { bandForPm25, bandForAqi, type AqiBand } from "@/lib/aqi";
import { cn } from "@/lib/utils";

export function AqiBadge({
  pm25,
  aqi,
  band,
  showValue = true,
  className,
}: {
  pm25?: number | null;
  aqi?: number | null;
  band?: AqiBand;
  showValue?: boolean;
  className?: string;
}) {
  const resolved = band ?? (aqi != null ? bandForAqi(aqi) : bandForPm25(pm25 ?? 0));
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        resolved.bg,
        className,
      )}
    >
      {resolved.labelTh}
      {showValue && aqi != null && <span className="opacity-80">AQI {aqi}</span>}
    </span>
  );
}

/** Small colored dot for tables / legends. */
export function AqiDot({ band, className }: { band: AqiBand; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full", className)}
      style={{ backgroundColor: band.color }}
      aria-hidden
    />
  );
}
