import Link from "next/link";
import { riskBg, riskLabel, pm25Color } from "@/lib/colors";
import type { ProvinceSnapshot } from "@/types/air";

interface Props {
  province: ProvinceSnapshot;
  rank?: number;
  compact?: boolean;
}

export function ProvinceSummaryCard({ province, rank, compact = false }: Props) {
  const pm25 = province.air.pm25;

  if (compact) {
    return (
      <Link href={`/province/${province.slug}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-3 py-2 transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70">
        <div className="flex items-center gap-2">
          {rank && <span className="text-sm font-bold text-slate-500">#{rank}</span>}
          <div>
            <p className="text-sm font-semibold leading-tight">{province.province_name_th}</p>
            <p className="text-xs text-slate-500">{province.province_name_en} · {province.region}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-bold" style={{ color: pm25Color(pm25) }}>{pm25.toFixed(1)}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${riskBg(pm25)}`}>{riskLabel(pm25)}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/province/${province.slug}`} className="group flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:shadow-lg hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex items-start justify-between">
        <div>
          {rank && <span className="text-xs font-bold text-slate-400">#{rank}</span>}
          <h3 className="text-base font-bold leading-tight">{province.province_name_th}</h3>
          <p className="text-xs text-slate-500">{province.province_name_en} · {province.region}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${riskBg(pm25)}`}>{riskLabel(pm25)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t pt-2 text-xs">
        <div>
          <p className="text-slate-500">PM2.5</p>
          <p className="font-bold" style={{ color: pm25Color(pm25) }}>{pm25.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-slate-500">PM10</p>
          <p className="font-bold text-orange-600">{province.air.pm10.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-slate-500">AQI</p>
          <p className="font-bold text-purple-600">{province.air.aqi}</p>
        </div>
        <div>
          <p className="text-slate-500">อุณหภูมิ</p>
          <p className="font-bold text-cyan-600">{province.weather.temp.toFixed(1)}°C</p>
        </div>
        <div>
          <p className="text-slate-500">ความชื้น</p>
          <p className="font-bold text-blue-600">{province.weather.humidity}%</p>
        </div>
        <div>
          <p className="text-slate-500">ลม</p>
          <p className="font-bold text-teal-600">{province.weather.wind.toFixed(1)} m/s</p>
        </div>
      </div>
      {province.hotspot_count > 0 && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <span>🔥</span>
          <span>{province.hotspot_count} จุดความร้อน</span>
        </div>
      )}
      <p className="text-xs text-slate-500 line-clamp-2">{province.insight}</p>
    </Link>
  );
}
