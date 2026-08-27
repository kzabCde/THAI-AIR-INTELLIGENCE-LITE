"use client";

import Link from "next/link";
import { Map, ArrowUpRight, Flame, ShieldCheck } from "lucide-react";
import { IsanMapCard } from "@/components/map/isan-map-card";
import type { MapProvince } from "@/components/map/types";
import type { RegionOverview } from "@/services/types";

export function OverviewMiniMap({
  overview,
  selectedProvinceId = "all",
}: {
  overview: RegionOverview;
  selectedProvinceId?: string;
}) {
  const mapProvinces: MapProvince[] = overview.snapshots.map((s) => ({
    id: s.province.id,
    slug: s.province.slug,
    nameTh: s.province.nameTh,
    nameEn: s.province.nameEn,
    lat: s.province.lat,
    lon: s.province.lon,
    pm25: s.pm25,
    aqi: s.aqi,
    color: s.band.color,
    labelTh: s.band.labelTh,
    temperature: s.temperature,
    humidity: s.humidity,
    windSpeed: s.windSpeed,
    windDirection: s.windDirection,
    hotspots: s.hotspotCount,
    observedAt: s.observedAt,
  }));

  const exceededCount = overview.snapshots.filter(
    (s) => (s.pm25 ?? 0) > 37.5 || (s.aqi ?? 0) > 50,
  ).length;
  const goodAirCount = overview.snapshots.length - exceededCount;

  return (
    <div className="space-y-2.5">
      {/* ── Header Row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Map className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white leading-none">
              แผนที่คุณภาพอากาศภาคอีสาน
            </h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              แสดงสถานะและตำแหน่ง 20 จังหวัด
            </p>
          </div>
        </div>

        <Link
          href="/map"
          className="group inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition"
        >
          <span>เปิดแผนที่เต็ม</span>
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {/* ── Map Card Container ── */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
        {/* Interactive Leaflet mini map */}
        <div className="h-[360px] sm:h-[420px] w-full">
          <IsanMapCard
            provinces={mapProvinces}
            height="h-full"
            activeMode="pm25"
            selectedProvinceId={selectedProvinceId}
            avgPm25={overview.avgPm25 ?? 0}
            exceededCount={exceededCount}
            totalHotspots={overview.totalHotspots ?? 0}
          />
        </div>

        {/* Quick Summary Pill Bar at bottom of map */}
        <div className="px-3.5 py-2.5 bg-zinc-50/90 dark:bg-zinc-900/90 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>อยู่ในเกณฑ์ดี <strong className="font-bold text-zinc-900 dark:text-white">{goodAirCount}</strong>/20 จังหวัด</span>
            </div>

            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <Flame className="h-4 w-4 text-orange-500" />
              <span>จุดความร้อน <strong className="font-bold text-zinc-900 dark:text-white">{overview.totalHotspots ?? 0}</strong> จุด</span>
            </div>
          </div>

          <Link
            href="/map"
            className="text-[11px] font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white underline underline-offset-2"
          >
            ดูทิศทางลมและชั้นข้อมูลแบบเต็ม →
          </Link>
        </div>
      </div>
    </div>
  );
}
