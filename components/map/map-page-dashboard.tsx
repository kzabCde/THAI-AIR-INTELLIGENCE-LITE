"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { MapControlBar } from "@/components/map/map-control-bar";
import { IsanMapCard } from "@/components/map/isan-map-card";
import { MapBottomCards } from "@/components/map/map-bottom-cards";
import { fmtTimeTh } from "@/lib/format";
import type { MapProvince, MapFilterMode } from "@/components/map/types";
import type { RegionOverview } from "@/services/types";

/** Convert wind_direction degrees to Thai compass label */
function degreesToThaiDirection(deg: number): string {
  const dirs = [
    "เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้",
    "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ",
  ];
  return dirs[Math.round(deg / 45) % 8];
}

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

  const totalHotspots = overview.totalHotspots ?? 0;
  const avgPm25 = overview.avgPm25 ?? 0;
  const observedAt = overview.observedAt;

  // ── Compute real average wind speed from all province snapshots ───────────
  const windSnapshots = overview.snapshots.filter((s) => s.windSpeed != null);
  const avgWindSpeed = windSnapshots.length
    ? +(windSnapshots.reduce((sum, s) => sum + (s.windSpeed ?? 0), 0) / windSnapshots.length).toFixed(1)
    : 0;

  // ── Compute dominant wind direction from province weather data ────────────
  // MapProvince has windDirection from weather_latest (degrees or null)
  const dirSnapshots = mapProvinces.filter((p) => p.windDirection != null);
  let dominantWindDir = "ไม่มีข้อมูล";
  if (dirSnapshots.length) {
    // Circular mean of wind directions (in degrees)
    let sinSum = 0, cosSum = 0;
    for (const p of dirSnapshots) {
      const rad = ((p.windDirection as number) * Math.PI) / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    const meanDeg = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360;
    dominantWindDir = degreesToThaiDirection(meanDeg);
  }

  // ── Compute rain chance from 24h accumulated precipitation ─────────────────
  // % of provinces that had measurable rain (>0.5mm) in the last 24 hours
  const precSnapshots = overview.snapshots.filter((s) => s.precipitation24h != null);
  const rainyCount = precSnapshots.filter((s) => (s.precipitation24h ?? 0) > 0.5).length;
  const rainChance = precSnapshots.length
    ? Math.round((rainyCount / precSnapshots.length) * 100)
    : 0;

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

      {/* 3. Interactive Leaflet Satellite Map Canvas */}
      <IsanMapCard
        key={refreshKey}
        provinces={mapProvinces}
        height="h-[560px]"
        activeMode={activeMode}
        selectedProvinceId={selectedProvinceId}
        avgPm25={avgPm25}
        exceededCount={exceededCount}
        windSpeed={avgWindSpeed}
        windDirection={dominantWindDir}
      />

      {/* 4. Bottom 3 Situation KPI Cards — all real data */}
      <MapBottomCards
        totalHotspots={totalHotspots}
        windSpeed={avgWindSpeed}
        windDirection={dominantWindDir}
        rainChance={rainChance}
      />
    </div>
  );
}

