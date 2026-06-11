import { AQI_BANDS } from "@/lib/aqi";

export function AqiLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      {AQI_BANDS.map((b) => (
        <span key={b.level} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
          <span className="muted">{b.labelTh}</span>
        </span>
      ))}
    </div>
  );
}
