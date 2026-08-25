"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { MapProvince, MapFilterMode } from "./types";

const IsanMap = dynamic(() => import("./isan-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-3xl min-h-[520px]" />,
});

export function IsanMapCard({
  provinces,
  height = "h-[540px]",
  activeMode = "pm25",
  selectedProvinceId = "all",
  avgPm25 = 0,
  exceededCount = 0,
  totalHotspots = 0,
  windSpeed = 0,
  windDirection = "ไม่มีข้อมูล",
}: {
  provinces: MapProvince[];
  height?: string;
  activeMode?: MapFilterMode;
  selectedProvinceId?: string;
  avgPm25?: number;
  exceededCount?: number;
  totalHotspots?: number;
  windSpeed?: number;
  windDirection?: string;
}) {
  return (
    <div className={`w-full ${height}`}>
      <IsanMap
        provinces={provinces}
        activeMode={activeMode}
        selectedProvinceId={selectedProvinceId}
        avgPm25={avgPm25}
        exceededCount={exceededCount}
        totalHotspots={totalHotspots}
        windSpeed={windSpeed}
        windDirection={windDirection}
      />
    </div>
  );
}
