"use client";

import dynamic from "next/dynamic";
import { AqiLegend } from "@/components/ui/aqi-legend";
import { Skeleton } from "@/components/ui/skeleton";
import type { MapProvince } from "./types";

const IsanMap = dynamic(() => import("./isan-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-2xl" />,
});

export function IsanMapCard({
  provinces,
  height = "h-[460px]",
}: {
  provinces: MapProvince[];
  height?: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className={height}>
        <IsanMap provinces={provinces} />
      </div>
      <div className="border-t border-border px-4 py-3">
        <AqiLegend />
      </div>
    </div>
  );
}
