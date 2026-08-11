"use client";

import { useState } from "react";
import { ProvinceHeroCard } from "@/components/overview/province-hero-card";
import { HealthAdviceGrid } from "@/components/overview/health-advice-grid";
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
  const [selectedProvinceId, setSelectedProvinceId] = useState(initialProvinceId);

  const activeSnapshot =
    overview.snapshots.find((s) => s.province.id === selectedProvinceId) ??
    overview.snapshots[0];

  const currentPm25 = activeSnapshot?.pm25 ?? overview.avgPm25;
  const currentAqi = activeSnapshot?.aqi ?? overview.avgAqi;

  const maxAqi = overview.worst?.aqi ?? 0;
  const worstProvinceName = overview.worst?.province.nameTh ?? "";

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* 1. Hero Banner: Province Selector, Dynamic AQI Color Gradient & Weather Capsule Box */}
      <ProvinceHeroCard
        snapshots={overview.snapshots}
        initialProvinceId={initialProvinceId}
        onProvinceChange={(id) => setSelectedProvinceId(id)}
      />

      {/* 2. Dynamic Health Guidance Pills based on actual AQI */}
      <HealthAdviceGrid pm25={currentPm25} aqi={currentAqi} />

      {/* 3. Real ML Forecast Predictions (24h Trend Chart & 7-Day Forecast with AqiFaceIcon) */}
      <AiForecastHighlights provinceId={selectedProvinceId} avgAqi={currentAqi} />

      {/* 4. Real Watchlist Card (Shows high-risk provinces or explicit empty state) */}
      <WatchlistAndGoodAir snapshots={overview.snapshots} />

      {/* 5. Real Announcement / News Banner */}
      <AnnouncementBanner maxAqi={maxAqi} worstProvinceName={worstProvinceName} />
    </div>
  );
}
