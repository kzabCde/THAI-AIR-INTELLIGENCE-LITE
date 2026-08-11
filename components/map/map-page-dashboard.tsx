"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { MapControlBar } from "@/components/map/map-control-bar";
import { IsanMapCard } from "@/components/map/isan-map-card";
import { MapBottomCards } from "@/components/map/map-bottom-cards";
import { fmtTimeTh } from "@/lib/format";
import type { MapProvince, MapFilterMode } from "@/components/map/types";
import type { RegionOverview } from "@/services/types";

export function MapPageDashboard({
  overview,
  mapProvinces,
}: {
  overview: RegionOverview;
  mapProvinces: MapProvince[];
}) {
  const [activeMode, setActiveMode] = useState<MapFilterMode>("pm25");
  const [selectedProvinceId, setSelectedProvinceId] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const exceededCount = overview.snapshots.filter(
    (s) => (s.pm25 ?? 0) > 37.5 || (s.aqi ?? 0) > 50,
  ).length;

  const totalHotspots = overview.totalHotspots ?? 126;
  const avgPm25 = overview.avgPm25 ?? 42;
  const observedAt = overview.observedAt;

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-6">
      {/* 1. Header Bar: Title + Timestamp */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
          แผนที่คุณภาพอากาศภาคอีสาน
        </h1>

        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          <span>อัปเดตล่าสุด {fmtTimeTh(observedAt)} น.</span>
          <button
            type="button"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            title="รีเฟรชข้อมูล"
            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 transition"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 2. Map Control Filter Bar with Custom Opaque Province Select Modal */}
      <MapControlBar
        snapshots={overview.snapshots}
        activeMode={activeMode}
        onModeChange={(mode) => setActiveMode(mode)}
        selectedProvinceId={selectedProvinceId}
        onProvinceChange={(id) => setSelectedProvinceId(id)}
      />

      {/* 3. Interactive Leaflet Satellite Map Canvas with Collapsible Overlays & Zoom Controls */}
      <IsanMapCard
        key={refreshKey}
        provinces={mapProvinces}
        height="h-[560px]"
        activeMode={activeMode}
        selectedProvinceId={selectedProvinceId}
        avgPm25={avgPm25}
        exceededCount={exceededCount}
        windSpeed={8}
        windDirection="ตะวันออกเฉียงเหนือ"
      />

      {/* 4. Bottom 3 Situation KPI Cards */}
      <MapBottomCards
        totalHotspots={totalHotspots}
        windSpeed={8}
        windDirection="ตะวันออกเฉียงเหนือ"
        rainChance={10}
      />
    </div>
  );
}
