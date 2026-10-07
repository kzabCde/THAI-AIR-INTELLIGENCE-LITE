"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Plus,
  Minus,
  Target,
  Flame,
  Wind,
  CloudSun,
  Layers,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ISAN_CENTER } from "@/lib/isan";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import { pm25ToAqi } from "@/lib/aqi";
import type { MapProvince, MapFilterMode, MapBasemap, MapLayerOptions } from "./types";

// Ensure default Leaflet marker assets load safely
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/** Eye-friendly, soft/muted palette matching natural environmental monitoring standards */
const SOFT_PALETTE = {
  veryGood: { bg: "#7bc260", text: "#0f172a", label: "ดีมาก" },
  good: { bg: "#98ce56", text: "#0f172a", label: "ดี" },
  moderate: { bg: "#ebd053", text: "#0f172a", label: "ปานกลาง" },
  unhealthySensitive: { bg: "#e89a43", text: "#0f172a", label: "เริ่มมีผลกระทบ" },
  unhealthy: { bg: "#dd614f", text: "#ffffff", label: "มีผลกระทบ" },
  hazardous: { bg: "#a25d97", text: "#ffffff", label: "วิกฤต" },
  temp: { bg: "#5297c4", text: "#ffffff", label: "อุณหภูมิ" },
  wind: { bg: "#3f9b8e", text: "#ffffff", label: "แรงลม" },
  hotspotActive: { bg: "#d95f43", text: "#ffffff", label: "มีจุดความร้อน" },
  hotspotZero: { bg: "#64748b", text: "#ffffff", label: "ไม่มีจุดความร้อน" },
};

/** Get soft color tone and label for province based on active metric */
function getSoftMetricStyle(p: MapProvince, metric: MapFilterMode): { bg: string; text: string; label: string } {
  if (metric === "weather") {
    return { bg: SOFT_PALETTE.temp.bg, text: SOFT_PALETTE.temp.text, label: "อุณหภูมิ" };
  }
  if (metric === "wind") {
    return { bg: SOFT_PALETTE.wind.bg, text: SOFT_PALETTE.wind.text, label: "แรงลม" };
  }
  if (metric === "hotspot") {
    const count = p.hotspots ?? 0;
    return count > 0
      ? { bg: SOFT_PALETTE.hotspotActive.bg, text: "#ffffff", label: `${count} จุด` }
      : { bg: SOFT_PALETTE.hotspotZero.bg, text: "#ffffff", label: "0 จุด" };
  }

  if (metric === "pm10") {
    const val = p.pm10 ?? 0;
    if (val <= 50) return { bg: SOFT_PALETTE.veryGood.bg, text: SOFT_PALETTE.veryGood.text, label: "ดีมาก" };
    if (val <= 80) return { bg: SOFT_PALETTE.good.bg, text: SOFT_PALETTE.good.text, label: "ดี" };
    if (val <= 120) return { bg: SOFT_PALETTE.moderate.bg, text: SOFT_PALETTE.moderate.text, label: "ปานกลาง" };
    if (val <= 180) return { bg: SOFT_PALETTE.unhealthySensitive.bg, text: SOFT_PALETTE.unhealthySensitive.text, label: "เริ่มมีผลกระทบ" };
    return { bg: SOFT_PALETTE.unhealthy.bg, text: SOFT_PALETTE.unhealthy.text, label: "มีผลกระทบ" };
  }

  if (metric === "aqi") {
    const val = p.aqi ?? pm25ToAqi(p.pm25 ?? 0);
    if (val <= 25) return { bg: SOFT_PALETTE.veryGood.bg, text: SOFT_PALETTE.veryGood.text, label: "ดีมาก" };
    if (val <= 50) return { bg: SOFT_PALETTE.good.bg, text: SOFT_PALETTE.good.text, label: "ดี" };
    if (val <= 100) return { bg: SOFT_PALETTE.moderate.bg, text: SOFT_PALETTE.moderate.text, label: "ปานกลาง" };
    if (val <= 200) return { bg: SOFT_PALETTE.unhealthySensitive.bg, text: SOFT_PALETTE.unhealthySensitive.text, label: "เริ่มมีผลกระทบ" };
    if (val <= 300) return { bg: SOFT_PALETTE.unhealthy.bg, text: SOFT_PALETTE.unhealthy.text, label: "มีผลกระทบ" };
    return { bg: SOFT_PALETTE.hazardous.bg, text: SOFT_PALETTE.hazardous.text, label: "วิกฤต" };
  }

  // PM2.5 default
  const val = p.pm25 ?? 0;
  if (val <= 15.0) return { bg: SOFT_PALETTE.veryGood.bg, text: SOFT_PALETTE.veryGood.text, label: "ดีมาก" };
  if (val <= 25.0) return { bg: SOFT_PALETTE.good.bg, text: SOFT_PALETTE.good.text, label: "ดี" };
  if (val <= 37.5) return { bg: SOFT_PALETTE.moderate.bg, text: SOFT_PALETTE.moderate.text, label: "ปานกลาง" };
  if (val <= 75.0) return { bg: SOFT_PALETTE.unhealthySensitive.bg, text: SOFT_PALETTE.unhealthySensitive.text, label: "เริ่มมีผลกระทบ" };
  return { bg: SOFT_PALETTE.unhealthy.bg, text: SOFT_PALETTE.unhealthy.text, label: "มีผลกระทบ" };
}

/** Helper component to fly/pan map smoothly */
function MapFlyTo({
  province,
  isMiniPreview = false,
}: {
  province?: MapProvince;
  isMiniPreview?: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (province) {
      const targetZoom = isMiniPreview ? 8.0 : 9;
      map.flyTo([province.lat, province.lon], targetZoom, {
        duration: 0.8,
        easeLinearity: 0.25,
      });
    } else {
      map.flyTo(ISAN_CENTER, isMiniPreview ? 6.5 : 7, { duration: 0.8 });
    }
  }, [province, isMiniPreview, map]);
  return null;
}

/** Map Auto-Resizer for dynamic containers */
function MapAutoResizer() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    const t3 = setTimeout(() => map.invalidateSize(), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);
  return null;
}

/** Map Floating Custom Zoom Controls */
function CustomZoomControls() {
  const map = useMap();
  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        title="ซูมเข้า"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md backdrop-blur-md hover:bg-white transition active:scale-95"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        title="ซูมออก"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md backdrop-blur-md hover:bg-white transition active:scale-95"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={() => map.flyTo(ISAN_CENTER, 7, { duration: 1.0 })}
        title="กลับกึ่งกลางภาคอีสาน"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white/95 dark:bg-zinc-900/95 text-blue-600 dark:text-blue-400 shadow-md backdrop-blur-md hover:bg-white transition active:scale-95 mt-0.5"
      >
        <Target size={14} />
      </button>
    </div>
  );
}

/** Create custom HTML DivIcon for circular value marker + overlays */
function createProvinceMarkerIcon(
  p: MapProvince,
  isSelected: boolean,
  layers: MapLayerOptions,
) {
  const style = getSoftMetricStyle(p, layers.primaryMetric);
  let displayValue = "";

  if (layers.primaryMetric === "hotspot") {
    displayValue = `${p.hotspots ?? 0}`;
  } else if (layers.primaryMetric === "weather") {
    displayValue = p.temperature != null ? `${Math.round(p.temperature)}°` : "-";
  } else if (layers.primaryMetric === "wind") {
    displayValue = p.windSpeed != null ? `${Math.round(p.windSpeed)}` : "-";
  } else if (layers.primaryMetric === "pm10") {
    displayValue = p.pm10 != null ? `${Math.round(p.pm10)}` : "-";
  } else if (layers.primaryMetric === "aqi") {
    displayValue = `${p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)}`;
  } else {
    // pm25
    displayValue = `${Math.round(p.pm25 ?? 0)}`;
  }

  const circleSize = isSelected ? 38 : 32;
  const hotspotCount = p.hotspots ?? 0;

  // IMPORTANT: Only render the flame badge if hotspots ACTUALLY exist (> 0) and showHotspots is enabled!
  const hasHotspot = layers.showHotspots && hotspotCount > 0;
  const flameBadgeHtml = hasHotspot
    ? `
      <div style="
        position: absolute;
        top: -7px;
        right: -9px;
        background-color: #d9534f;
        color: #ffffff;
        border-radius: 9999px;
        padding: 0 4px;
        height: 15px;
        display: inline-flex;
        align-items: center;
        gap: 1.5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        border: 1.5px solid #ffffff;
        font-size: 8.5px;
        font-weight: 800;
        z-index: 10;
        line-height: 1;
      ">
        <svg width="7.5" height="7.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
        <span>${hotspotCount}</span>
      </div>
    `
    : "";

  // Combine Wind & Weather sub-badges so both can be viewed simultaneously without overlapping or hiding each other
  const showWind = layers.showWindVectors && p.windSpeed != null;
  const showWeather = layers.showWeatherBadges && p.temperature != null;
  const windDeg = p.windDirection ?? 0;

  let subBadgeHtml = "";
  if (showWind && showWeather) {
    subBadgeHtml = `
      <div style="
        margin-top: 2px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(4px);
        padding: 1.5px 5px;
        border-radius: 6px;
        font-size: 8.5px;
        font-weight: 700;
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.2);
        line-height: 1;
        box-shadow: 0 2px 4px rgba(0,0,0,0.35);
      ">
        <span style="color: #fed7aa;">${Math.round(p.temperature ?? 0)}°C</span>
        <span style="color: rgba(255,255,255,0.35);">·</span>
        <span style="display: inline-flex; align-items: center; gap: 1.5px; color: #38bdf8;">
          <svg style="transform: rotate(${windDeg}deg); width: 7.5px; height: 7.5px; shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
          ${Math.round(p.windSpeed ?? 0)}k
        </span>
      </div>
    `;
  } else if (showWind) {
    subBadgeHtml = `
      <div style="
        margin-top: 2px;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(4px);
        padding: 1.5px 5px;
        border-radius: 6px;
        font-size: 8.5px;
        font-weight: 700;
        color: #38bdf8;
        border: 1px solid rgba(255, 255, 255, 0.2);
        line-height: 1;
        box-shadow: 0 2px 4px rgba(0,0,0,0.35);
      ">
        <svg style="transform: rotate(${windDeg}deg); width: 7.5px; height: 7.5px; shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
        <span>${Math.round(p.windSpeed ?? 0)} km/h</span>
      </div>
    `;
  } else if (showWeather) {
    subBadgeHtml = `
      <div style="
        margin-top: 2px;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(4px);
        padding: 1.5px 5px;
        border-radius: 6px;
        font-size: 8.5px;
        font-weight: 700;
        color: #fed7aa;
        border: 1px solid rgba(255, 255, 255, 0.2);
        line-height: 1;
        box-shadow: 0 2px 4px rgba(0,0,0,0.35);
      ">
        <span>${Math.round(p.temperature ?? 0)}°C</span>
        ${p.humidity != null ? `<span style="color: rgba(255,255,255,0.35);">·</span><span style="color: #93c5fd;">${Math.round(p.humidity)}%</span>` : ""}
      </div>
    `;
  }

  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 80px; cursor: pointer;">
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="
          background-color: ${style.bg};
          width: ${circleSize}px;
          height: ${circleSize}px;
          border-radius: 9999px;
          border: 2px solid #ffffff;
          box-shadow: 0 3px 10px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${style.text};
          font-weight: 800;
          font-size: ${displayValue.length >= 3 ? "11px" : "12px"};
          font-family: inherit;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        ">
          ${displayValue}
        </div>
        ${flameBadgeHtml}
      </div>
      <span style="
        margin-top: 1.5px;
        color: #ffffff;
        font-weight: 700;
        font-size: 10px;
        text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 5px rgba(0,0,0,0.9);
        white-space: nowrap;
        pointer-events: none;
      ">
        ${p.nameTh}
      </span>
      ${subBadgeHtml}
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-province-marker",
    iconSize: [80, 60],
    iconAnchor: [40, circleSize / 2],
  });
}

/** 100% Free, reliable basemaps without API key watermarks */
const BASEMAP_TILES: Record<MapBasemap, { url: string; subdomains: string[]; attribution: string; maxZoom: number }> = {
  satellite: {
    url: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "&copy; Google Maps",
    maxZoom: 20,
  },
  terrain: {
    url: "https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "&copy; Google Maps Terrain",
    maxZoom: 20,
  },
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    subdomains: ["a", "b", "c"],
    attribution: "&copy; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  },
};

export default function IsanMap({
  provinces,
  activeMode = "pm25",
  selectedProvinceId = "all",
  avgPm25 = 0,
  exceededCount = 0,
  totalHotspots = 0,
  windSpeed = 0,
  windDirection = "ไม่มีข้อมูล",
  isMiniPreview = false,
}: {
  provinces: MapProvince[];
  activeMode?: MapFilterMode;
  selectedProvinceId?: string;
  avgPm25?: number;
  exceededCount?: number;
  totalHotspots?: number;
  windSpeed?: number;
  windDirection?: string;
  isMiniPreview?: boolean;
}) {
  const router = useRouter();

  // Multi-layer configuration state (focused strictly on Overlays and Basemap)
  const [layers, setLayers] = useState<MapLayerOptions>({
    primaryMetric: activeMode,
    showHotspots: true,
    showWindVectors: false,
    showWeatherBadges: false,
    showAtmosphereOverlay: true,
    basemap: "satellite",
  });

  // Sync activeMode from top bar whenever it changes
  useEffect(() => {
    setLayers((prev) => ({ ...prev, primaryMetric: activeMode }));
  }, [activeMode]);

  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  const selectedProvince = useMemo(
    () => provinces.find((p) => p.id === selectedProvinceId),
    [provinces, selectedProvinceId],
  );

  return (
    <div
      className={`relative w-full h-full ${
        isMiniPreview ? "min-h-[180px] rounded-2xl" : "min-h-[500px] rounded-3xl"
      } overflow-hidden shadow-lg border border-zinc-200/90 dark:border-zinc-800 bg-slate-950`}
    >
      <MapContainer
        center={selectedProvince ? [selectedProvince.lat, selectedProvince.lon] : ISAN_CENTER}
        zoom={selectedProvince ? (isMiniPreview ? 8.0 : 9) : (isMiniPreview ? 6.5 : 7)}
        minZoom={5}
        scrollWheelZoom={!isMiniPreview}
        zoomControl={false}
        className="h-full w-full z-0"
        preferCanvas
      >
        <MapFlyTo province={selectedProvince} isMiniPreview={isMiniPreview} />
        <MapAutoResizer />

        {!isMiniPreview && <CustomZoomControls />}

        {/* Selected Basemap Tile Layer */}
        <TileLayer
          key={layers.basemap}
          attribution={BASEMAP_TILES[layers.basemap].attribution}
          url={BASEMAP_TILES[layers.basemap].url}
          subdomains={BASEMAP_TILES[layers.basemap].subdomains}
          maxZoom={BASEMAP_TILES[layers.basemap].maxZoom}
        />

        {/* Atmospheric Dispersion Tint Overlay (Soft Color Radii) */}
        {layers.showAtmosphereOverlay &&
          provinces.map((p) => {
            const style = getSoftMetricStyle(p, layers.primaryMetric);
            return (
              <Circle
                key={`atmo-${p.id}`}
                center={[p.lat, p.lon]}
                radius={32000}
                pathOptions={{
                  fillColor: style.bg,
                  fillOpacity: 0.18,
                  stroke: false,
                }}
              />
            );
          })}

        {/* 20 Province Markers with detailed compact popup */}
        {provinces.map((p) => {
          const isSelected = p.id === selectedProvinceId;
          const markerIcon = createProvinceMarkerIcon(p, isSelected, layers);

          return (
            <Marker key={p.id} position={[p.lat, p.lon]} icon={markerIcon}>
              <Popup
                className="custom-province-popup"
                offset={[0, -18]}
                autoPan={true}
                autoPanPaddingTopLeft={[80, 80]}
                autoPanPaddingBottomRight={[50, 50]}
              >
                <div className="w-[215px] rounded-2xl border border-zinc-200/90 dark:border-zinc-700/80 bg-white/95 dark:bg-slate-900/95 text-zinc-900 dark:text-white p-3 shadow-2xl backdrop-blur-md space-y-2">
                  {/* Header: Province Name & Label Badge */}
                  <div className="flex items-center justify-between gap-1.5 min-w-0 pr-4">
                    <div className="min-w-0">
                      <span className="text-[13px] font-bold text-zinc-900 dark:text-white truncate block">
                        {p.nameTh}
                      </span>
                      <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium block leading-none">
                        {p.nameEn}
                      </span>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-bold shrink-0 shadow-xs"
                      style={{
                        backgroundColor: getSoftMetricStyle(p, layers.primaryMetric).bg,
                        color: getSoftMetricStyle(p, layers.primaryMetric).text,
                      }}
                    >
                      {getSoftMetricStyle(p, layers.primaryMetric).label}
                    </span>
                  </div>

                  {/* Main Metric Cards */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100/90 dark:bg-white/5 p-1.5 border border-zinc-200/80 dark:border-white/10 text-center">
                    <div>
                      <span className="text-[8px] font-semibold text-zinc-500 dark:text-zinc-400 block leading-tight">
                        PM2.5
                      </span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums leading-tight">
                        {fmtPm25(p.pm25)}
                      </span>
                    </div>
                    <div className="border-x border-zinc-200 dark:border-white/10">
                      <span className="text-[8px] font-semibold text-zinc-500 dark:text-zinc-400 block leading-tight">
                        AQI
                      </span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums leading-tight">
                        {p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] font-semibold text-amber-600 dark:text-amber-400/90 block leading-tight">
                        จุดความร้อน
                      </span>
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-300 tabular-nums leading-tight">
                        {p.hotspots ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Weather & Wind Row */}
                  {(p.temperature != null || p.windSpeed != null) && (
                    <div className="flex items-center justify-between text-[9px] font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100/90 dark:bg-white/5 rounded-lg px-2 py-1 border border-zinc-200/80 dark:border-white/5">
                      <span>อุณหภูมิ {p.temperature ? `${Math.round(p.temperature)}°C` : "–"}</span>
                      <span className="text-zinc-400 dark:text-zinc-600">·</span>
                      <span>ความชื้น {p.humidity ? `${Math.round(p.humidity)}%` : "–"}</span>
                      <span className="text-zinc-400 dark:text-zinc-600">·</span>
                      <span>ลม {p.windSpeed ? `${Math.round(p.windSpeed)}k` : "–"}</span>
                    </div>
                  )}

                  {/* Time Info */}
                  {p.observedAt && (
                    <div className="text-[8.5px] text-zinc-500 dark:text-zinc-400 font-medium">
                      อัปเดต {fmtTimeTh(p.observedAt)} น.
                    </div>
                  )}

                  {/* Action Link Button */}
                  <button
                    type="button"
                    onClick={() => router.push(`/province/${p.id}`)}
                    className="w-full flex items-center justify-center gap-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 py-1.5 text-[10.5px] font-semibold transition border border-zinc-300/80 dark:border-zinc-700 active:scale-[0.98]"
                  >
                    <span>ดูข้อมูลเจาะลึก</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Right Floating Layer Control Stack (Focused on Overlays & Basemaps, No Redundant Metric Switcher) ── */}
      {!isMiniPreview && (
        <div className="absolute right-3 top-3 z-[1000] pointer-events-auto">
          {isLayerMenuOpen ? (
            <div className="w-60 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/90 bg-white/95 dark:bg-zinc-900/95 p-3 text-zinc-800 dark:text-zinc-100 shadow-2xl backdrop-blur-md space-y-3 animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal size={14} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold">ข้อมูลซ้อนทับ & แผนที่</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLayerMenuOpen(false)}
                  className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                  title="ปิดเมนู"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Group: Environmental Overlays & Badges */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  ข้อมูลสิ่งแวดล้อม
                </span>

                {/* Hotspot Toggle */}
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Flame size={14} className="text-amber-500" />
                    <span>จุดความร้อน</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layers.showHotspots}
                    onChange={(e) =>
                      setLayers((prev) => ({ ...prev, showHotspots: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </label>

                {/* Wind Vectors Toggle */}
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Wind size={14} className="text-teal-500" />
                    <span>ทิศทางและแรงลม</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layers.showWindVectors}
                    onChange={(e) =>
                      setLayers((prev) => ({ ...prev, showWindVectors: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </label>

                {/* Weather Toggle */}
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <CloudSun size={14} className="text-sky-500" />
                    <span>สภาพอากาศ & อุณหภูมิ</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layers.showWeatherBadges}
                    onChange={(e) =>
                      setLayers((prev) => ({ ...prev, showWeatherBadges: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </label>

                {/* Atmosphere Overlay Toggle */}
                <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Layers size={14} className="text-indigo-400" />
                    <span>ชั้นมวลอากาศไล่เฉด</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layers.showAtmosphereOverlay}
                    onChange={(e) =>
                      setLayers((prev) => ({ ...prev, showAtmosphereOverlay: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </label>
              </div>

              {/* Group: Basemap Selector */}
              <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  แผนที่ฐาน
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: "satellite", label: "ดาวเทียม" },
                      { id: "terrain", label: "ภูมิประเทศ" },
                      { id: "dark", label: "โหมดมืด" },
                    ] as const
                  ).map((base) => (
                    <button
                      key={base.id}
                      type="button"
                      onClick={() => setLayers((prev) => ({ ...prev, basemap: base.id }))}
                      className={`py-1 px-1 rounded-lg text-[9.5px] font-bold transition text-center ${
                        layers.basemap === base.id
                          ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {base.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsLayerMenuOpen(true)}
              className="flex items-center gap-2 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/90 bg-white/95 dark:bg-zinc-900/95 px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-100 shadow-xl backdrop-blur-md hover:bg-white dark:hover:bg-zinc-800 transition active:scale-95"
            >
              <SlidersHorizontal size={14} className="text-blue-600 dark:text-blue-400" />
              <span>เลือกชั้นข้อมูล</span>
            </button>
          )}
        </div>
      )}

      {/* ── Dynamic Soft & Eye-Pleasing Legend Bar (Bottom Strip) ── */}
      {!isMiniPreview && (
        <div className="absolute left-3 bottom-3 z-[1000] pointer-events-auto hidden sm:block">
          <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-700/80 bg-white/95 dark:bg-slate-900/90 px-3 py-1.5 text-zinc-800 dark:text-white backdrop-blur-md shadow-xl flex items-center gap-3">
            <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
              เกณฑ์ {layers.primaryMetric.toUpperCase()}
            </span>
            {layers.primaryMetric === "hotspot" ? (
              <div className="flex items-center gap-3 text-[9px] font-medium text-zinc-700 dark:text-zinc-200">
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.hotspotZero.bg }} />
                  <span>ไม่มีจุดความร้อน (0 จุด)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.hotspotActive.bg }} />
                  <span>มีจุดความร้อน (&ge;1 จุด)</span>
                </div>
              </div>
            ) : layers.primaryMetric === "pm10" ? (
              <div className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-700 dark:text-zinc-200">
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.veryGood.bg }} />
                  <span>ดีมาก (0–50)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.good.bg }} />
                  <span>ดี (50–80)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.moderate.bg }} />
                  <span>ปานกลาง (80–120)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.unhealthySensitive.bg }} />
                  <span>เริ่มมีผล (120–180)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.unhealthy.bg }} />
                  <span>มีผลกระทบ (&gt;180)</span>
                </div>
              </div>
            ) : layers.primaryMetric === "aqi" ? (
              <div className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-700 dark:text-zinc-200">
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.veryGood.bg }} />
                  <span>ดีมาก (0–25)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.good.bg }} />
                  <span>ดี (26–50)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.moderate.bg }} />
                  <span>ปานกลาง (51–100)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.unhealthySensitive.bg }} />
                  <span>เริ่มมีผล (101–200)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.unhealthy.bg }} />
                  <span>มีผลกระทบ (&gt;200)</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[9px] font-medium text-zinc-700 dark:text-zinc-200">
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.veryGood.bg }} />
                  <span>ดีมาก (0–15)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.good.bg }} />
                  <span>ดี (15–25)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.moderate.bg }} />
                  <span>ปานกลาง (25–37.5)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.unhealthySensitive.bg }} />
                  <span>เริ่มมีผล (37.5–75)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOFT_PALETTE.unhealthy.bg }} />
                  <span>มีผลกระทบ (&gt;75)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
