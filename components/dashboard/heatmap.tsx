"use client";

import type { ProvinceSnapshot } from "@/types/air";

function color(pm25: number) {
  if (pm25 <= 25) return "bg-emerald-500";
  if (pm25 <= 50) return "bg-lime-500";
  if (pm25 <= 75) return "bg-yellow-500";
  if (pm25 <= 100) return "bg-orange-500";
  if (pm25 <= 150) return "bg-red-500";
  return "bg-purple-700";
}

export function ThailandHeatMap({ rows }: { rows: ProvinceSnapshot[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {rows.map((row) => (
        <div key={row.slug} className={`rounded-lg p-2 text-white ${color(row.air.pm25)}`}>
          <p className="truncate text-xs font-semibold">{row.province_name_en}</p>
          <p className="text-sm">{row.air.pm25}</p>
        </div>
      ))}
    </div>
  );
}
