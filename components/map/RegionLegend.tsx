import { AQI_CATEGORIES, REGION_COLORS, THAI_REGION_ORDER } from "@/lib/map/region-colors";
import type { DisplayMode } from "@/lib/map/province-region";

type RegionLegendProps = {
  mode: DisplayMode;
};

export function RegionLegend({ mode }: RegionLegendProps) {
  const items = mode === "region"
    ? THAI_REGION_ORDER.map((region) => ({ label: region, color: REGION_COLORS[region].base }))
    : AQI_CATEGORIES.map((category) => ({ label: category.label, color: category.color }));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">{mode === "region" ? "คำอธิบายสีภูมิภาค" : "คำอธิบายสี AQI"}</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">Demo Data</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-slate-200">
            <span className="h-3 w-3 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
