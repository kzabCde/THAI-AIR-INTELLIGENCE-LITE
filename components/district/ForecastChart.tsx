import { NormalizedAirQuality } from "@/services/apiService";

export function ForecastChart({ data }: { data: NormalizedAirQuality | null }) {
  if (!data) return null;
  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-2 font-semibold">พยากรณ์ 1-3 วัน</h3>
      <div className="grid gap-2 md:grid-cols-3">
        {data.forecast.map((f) => <div key={f.day} className="rounded bg-slate-50 p-2"><p className="text-xs">{new Date(f.day).toLocaleDateString("th-TH")}</p><p>PM2.5 {f.pm25.toFixed(1)}</p><p>AQI {f.aqi}</p></div>)}
      </div>
    </div>
  );
}
