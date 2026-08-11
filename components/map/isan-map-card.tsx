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
  avgPm25 = 42,
  exceededCount = 3,
  windSpeed = 8,
  windDirection = "ตะวันออกเฉียงเหนือ",
}: {
  provinces: MapProvince[];
  height?: string;
  activeMode?: MapFilterMode;
  selectedProvinceId?: string;
  avgPm25?: number;
  exceededCount?: number;
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
        windSpeed={windSpeed}
        windDirection={windDirection}
      />
    </div>
  );
}
