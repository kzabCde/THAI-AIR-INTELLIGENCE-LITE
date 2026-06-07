"use client";

import { getAqiCategory, REGION_COLORS } from "@/lib/map/region-colors";
import type { MapProvince } from "@/lib/map/province-region";

type ProvinceTooltipProps = {
  province: MapProvince;
  x: number;
  y: number;
};

const RISK_LABELS: Record<string, string> = {
  Excellent: "ดีมาก",
  Good: "ดี",
  Moderate: "ปานกลาง",
  "Unhealthy Sensitive": "เริ่มมีผลกระทบต่อกลุ่มเสี่ยง",
  Unhealthy: "มีผลกระทบต่อสุขภาพ",
  Hazardous: "อันตราย",
};

export function getRiskLabel(riskLevel: string) {
  return RISK_LABELS[riskLevel] ?? riskLevel;
}

export function ProvinceTooltip({ province, x, y }: ProvinceTooltipProps) {
  const regionColor = REGION_COLORS[province.normalizedRegion];
  const aqiCategory = getAqiCategory(province.mockAqi);
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;

  return (
    <div
      className="pointer-events-none fixed z-50 w-64 rounded-2xl border border-white/15 bg-slate-950/95 p-3 text-xs text-white shadow-2xl shadow-black/40 backdrop-blur-xl"
      style={{ left: Math.min(x + 14, viewportWidth - 280), top: Math.min(y + 14, viewportHeight - 210) }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{province.province_name_th}</p>
          <p className="text-slate-300">{province.province_name_en}</p>
        </div>
        <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">Demo Data</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: regionColor.base }} />
        <span className="text-slate-200">{province.normalizedRegion}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="AQI" value={province.mockAqi.toFixed(0)} color={aqiCategory.color} />
        <Metric label="PM2.5" value={province.mockPm25.toFixed(1)} />
        <Metric label="PM10" value={province.mockPm10.toFixed(1)} />
      </div>
      <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5">
        <p className="text-slate-400">ระดับความเสี่ยง</p>
        <p className="font-semibold" style={{ color: aqiCategory.text }}>{getRiskLabel(province.risk_level)} · {aqiCategory.label}</p>
      </div>
    </div>
  );
}

function Metric({ label, value, color = "#e2e8f0" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2">
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p className="text-base font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
