import { getAqiCategory, REGION_COLORS, type ThaiRegionName } from "@/lib/map/region-colors";
import type { MapProvince } from "@/lib/map/province-region";

const RISK_LABELS: Record<string, string> = {
  Excellent: "ดีมาก",
  Good: "ดี",
  Moderate: "ปานกลาง",
  "Unhealthy Sensitive": "เริ่มมีผลกระทบต่อกลุ่มเสี่ยง",
  Unhealthy: "มีผลกระทบต่อสุขภาพ",
  Hazardous: "อันตราย",
};

type RegionSummaryCardProps = {
  region: ThaiRegionName;
  provinceCount: number;
  averageAqi: number;
  highest: MapProvince | null;
  compact?: boolean;
};

export function RegionSummaryCard({ region, provinceCount, averageAqi, highest, compact = false }: RegionSummaryCardProps) {
  const color = REGION_COLORS[region];
  const category = getAqiCategory(averageAqi);

  return (
    <article className={`rounded-2xl border bg-gradient-to-br ${color.gradient} p-3 shadow-lg ${color.shadow}`} style={{ borderColor: color.border }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color.base }} />
            <h3 className="truncate text-sm font-bold text-white">{region}</h3>
          </div>
          <p className="text-xs text-slate-300">{provinceCount} จังหวัด</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-xs font-bold" style={{ color: category.text }}>
          AQI {averageAqi} · Demo
        </span>
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-slate-950/30 p-2">
            <p className="text-slate-400">จังหวัดสูงสุด</p>
            <p className="truncate font-semibold text-white">{highest?.province_name_th ?? "-"}</p>
          </div>
          <div className="rounded-xl bg-slate-950/30 p-2">
            <p className="text-slate-400">ความเสี่ยง</p>
            <p className="truncate font-semibold" style={{ color: category.text }}>{highest ? RISK_LABELS[highest.risk_level] ?? highest.risk_level : category.label}</p>
          </div>
        </div>
      )}
    </article>
  );
}
