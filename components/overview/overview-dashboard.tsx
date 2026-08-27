"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProvinceHeroCard } from "@/components/overview/province-hero-card";
import { HealthAdviceGrid } from "@/components/overview/health-advice-grid";
import { OverviewMiniMap } from "@/components/overview/overview-mini-map";
import { AiForecastHighlights } from "@/components/overview/ai-forecast-highlights";
import { WatchlistAndGoodAir } from "@/components/overview/watchlist-and-good-air";
import { AnnouncementBanner } from "@/components/overview/announcement-banner";
import type { RegionOverview } from "@/services/types";

export function OverviewDashboard({
  overview,
  initialProvinceId,
}: {
  overview: RegionOverview;
  initialProvinceId: string;
}) {
  const router = useRouter();
  const [selectedProvinceId, setSelectedProvinceId] = useState(initialProvinceId);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefreshAll = () => {
    // Increment system refresh key to trigger cache-busting refetch for ML forecast and all client services
    setRefreshKey((prev) => prev + 1);
    // Revalidate Next.js server components
    router.refresh();
  };

  const activeSnapshot =
    overview.snapshots.find((s) => s.province.id === selectedProvinceId) ??
    overview.snapshots[0];

  const currentPm25 = activeSnapshot?.pm25 ?? overview.avgPm25;
  const currentAqi = activeSnapshot?.aqi ?? overview.avgAqi;

  const maxAqi = overview.worst?.aqi ?? 0;
  const worstProvinceName = overview.worst?.province.nameTh ?? "";

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 1. Hero Banner: Province Selector, Dynamic AQI Color Gradient, Weather Capsule Box & System Refresh */}
      <ProvinceHeroCard
        snapshots={overview.snapshots}
        initialProvinceId={initialProvinceId}
        onProvinceChange={(id) => setSelectedProvinceId(id)}
        onRefreshAll={handleRefreshAll}
      />

      {/* 2. Dynamic Health Guidance Pills, Recommended Time Window & Lifestyle Tabs */}
      <HealthAdviceGrid
        pm25={currentPm25}
        aqi={currentAqi}
        provinceId={selectedProvinceId}
        currentWeather={{
          temperature: activeSnapshot?.temperature,
          humidity: activeSnapshot?.humidity,
          windSpeed: activeSnapshot?.windSpeed,
          windDirection: activeSnapshot?.windDirection,
          precipitation: activeSnapshot?.precipitation,
          precipitation24h: activeSnapshot?.precipitation24h,
        }}
      />

      {/* 3. Mini Isan Air Quality Map Preview (Click to open full /map) */}
      <OverviewMiniMap
        overview={overview}
        selectedProvinceId={selectedProvinceId}
      />

      {/* 4. Real ML Forecast Predictions (24h Trend Chart & 7-Day Forecast with AqiFaceIcon & Full Refresh Trigger) */}
      <AiForecastHighlights
        provinceId={selectedProvinceId}
        avgAqi={currentAqi}
        refreshKey={refreshKey}
        currentWeather={{
          temperature: activeSnapshot?.temperature,
          humidity: activeSnapshot?.humidity,
          windSpeed: activeSnapshot?.windSpeed,
          windDirection: activeSnapshot?.windDirection,
          precipitation: activeSnapshot?.precipitation,
          precipitation24h: activeSnapshot?.precipitation24h,
        }}
      />

      {/* 4. Real Watchlist Card */}
      <WatchlistAndGoodAir snapshots={overview.snapshots} />

      {/* 5. Real Announcement / News Banner */}
      <AnnouncementBanner maxAqi={maxAqi} worstProvinceName={worstProvinceName} />
    </div>
  );
}
