"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ChevronUp, ChevronDown, Plus, Minus, Target, Flame, Activity, Palette } from "lucide-react";
import { ISAN_CENTER } from "@/lib/isan";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import { bandForPm25 } from "@/lib/aqi";
import type { MapProvince, MapFilterMode } from "./types";

// Ensure default Leaflet marker assets load safely
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/** Helper component to fly/pan map to a selected province from dropdown */
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
      // In mini preview, zoom 8.0 centers the province pin perfectly in the middle
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

/** Map Auto-Resizer for dynamic and mini containers */
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
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 pointer-events-auto">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        title="ซูมเข้า"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-800 dark:text-zinc-100 shadow-lg backdrop-blur-md hover:bg-white transition"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        title="ซูมออก"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-800 dark:text-zinc-100 shadow-lg backdrop-blur-md hover:bg-white transition"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={() => map.flyTo(ISAN_CENTER, 7, { duration: 1.0 })}
        title="กลับกึ่งกลาง"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-blue-600 dark:text-blue-400 shadow-lg backdrop-blur-md hover:bg-white transition mt-0.5"
      >
        <Target size={14} />
      </button>
    </div>
  );
}

/** Create custom HTML DivIcon for circular value marker + province name label */
function createProvinceMarkerIcon(p: MapProvince, isSelected: boolean, activeMode: MapFilterMode) {
  let displayValue = "";
  let color = p.color || "#10b981";
  let iconHtml = "";

  if (activeMode === "hotspot") {
    const count = p.hotspots ?? 0;
    displayValue = `${count}`;
    color = count > 0 ? "#ea580c" : "#475569";
    iconHtml = count > 0 ? `<span style="margin-right:2px; font-size:11px;">🔥</span>` : "";
  } else if (activeMode === "weather") {
    displayValue = p.temperature != null ? `${Math.round(p.temperature)}°` : "-";
    color = "#0284c7";
    iconHtml = "";
  } else if (activeMode === "wind") {
    displayValue = p.windSpeed != null ? `${Math.round(p.windSpeed)}` : "-";
    color = "#0d9488";
    iconHtml = "";
  } else if (activeMode === "aqi") {
    displayValue = `${p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)}`;
  } else {
    // pm25
    displayValue = `${Math.round(p.pm25 ?? 0)}`;
  }

  const circleSize = isSelected ? 40 : 34;
  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 60px; cursor: pointer;">
      <div style="
        background-color: ${color};
        width: ${circleSize}px;
        height: ${circleSize}px;
        border-radius: 9999px;
        border: 2px solid #ffffff;
        box-shadow: 0 0 12px ${color}99, 0 3px 8px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 900;
        font-size: ${displayValue.length >= 3 ? "10px" : "12px"};
        font-family: inherit;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      ">
        ${iconHtml}${displayValue}
      </div>
      <span style="
        margin-top: 1px;
        color: #ffffff;
        font-weight: 800;
        font-size: 10.5px;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 5px rgba(0,0,0,0.8);
        white-space: nowrap;
        pointer-events: none;
      ">
        ${p.nameTh}
      </span>
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-province-marker",
    iconSize: [60, 52],
    iconAnchor: [30, circleSize / 2],
  });
}

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
  const selectedProvince = useMemo(
    () => provinces.find((p) => p.id === selectedProvinceId),
    [provinces, selectedProvinceId]
  );
  const avgBand = bandForPm25(avgPm25);

  // States for Collapsible Floating Overlay Cards
  const [showSummaryCard, setShowSummaryCard] = useState(true);
  const [showLegendCard, setShowLegendCard] = useState(false);

  const provincesWithHotspots = provinces.filter((p) => (p.hotspots ?? 0) > 0).length;

  return (
    <div className={`relative w-full h-full ${isMiniPreview ? "min-h-[180px] rounded-2xl" : "min-h-[540px] rounded-3xl"} overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800`}>
      <MapContainer
        center={selectedProvince ? [selectedProvince.lat, selectedProvince.lon] : ISAN_CENTER}
        zoom={selectedProvince ? (isMiniPreview ? 8.0 : 9) : (isMiniPreview ? 6.5 : 7)}
        minZoom={5}
        scrollWheelZoom={!isMiniPreview}
        zoomControl={false}
        className="h-full w-full z-0"
        preferCanvas
      >
        {/* Fly to selected province */}
        <MapFlyTo province={selectedProvince} isMiniPreview={isMiniPreview} />
        <MapAutoResizer />

        {/* Custom Zoom Controls (Only in full map) */}
        {!isMiniPreview && <CustomZoomControls />}

        {/* Base Tile Layer: Google Maps Hybrid Satellite */}
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          subdomains={["mt0", "mt1", "mt2", "mt3"]}
          maxZoom={20}
        />

        {/* 20 Province Markers with anchored Map Popups */}
        {provinces.map((p) => {
          const isSelected = p.id === selectedProvinceId;
          const markerIcon = createProvinceMarkerIcon(p, isSelected, activeMode);

          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={markerIcon}
            >
              {/* Compact Popup anchored directly to the clicked province on the map */}
              <Popup
                className="custom-province-popup"
                offset={[0, -18]}
                autoPan={true}
                autoPanPaddingTopLeft={[80, 80]}
                autoPanPaddingBottomRight={[50, 50]}
              >
                <div className="w-[195px] sm:w-[205px] rounded-2xl border border-white/20 bg-slate-900/95 text-white p-2.5 shadow-2xl backdrop-blur-md space-y-1.5">
                  {/* Header: Province Name + Level Badge */}
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="text-[13px] font-black text-white truncate">
                      {p.nameTh}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-black text-white shrink-0 shadow-2xs"
                      style={{
                        backgroundColor:
                          activeMode === "hotspot" && (p.hotspots ?? 0) > 0
                            ? "#ea580c"
                            : p.color,
                      }}
                    >
                      {activeMode === "hotspot"
                        ? `🔥 ${p.hotspots ?? 0}`
                        : p.labelTh}
                    </span>
                  </div>

                  {/* Metrics Row: PM2.5, AQI, Hotspots in unified compact block */}
                  <div className="flex items-center justify-between rounded-lg bg-white/10 px-2 py-1 border border-white/10">
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">
                        PM2.5
                      </span>
                      <span className="text-base font-black text-white tabular-nums leading-tight">
                        {fmtPm25(p.pm25)}
                      </span>
                    </div>
                    <div className="w-px h-6 bg-white/15" />
                    <div>
                      <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">
                        AQI
                      </span>
                      <span className="text-base font-black text-white tabular-nums leading-tight">
                        {p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)}
                      </span>
                    </div>
                    <div className="w-px h-6 bg-white/15" />
                    <div>
                      <span className="text-[8px] font-bold text-amber-400 uppercase block leading-none">
                        FIRMS
                      </span>
                      <span className="text-base font-black text-amber-300 tabular-nums leading-tight">
                        {p.hotspots ?? 0}
                        <span className="text-[8px] font-bold text-slate-400 ml-0.5">
                          จุด
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Weather Row — Inline Compact */}
                  {p.temperature != null && (
                    <div className="flex items-center justify-between text-[9.5px] font-bold text-slate-300 bg-white/5 rounded-md px-1.5 py-0.5 border border-white/5">
                      <span>🌡 {p.temperature.toFixed(0)}°C</span>
                      <span className="text-slate-500">·</span>
                      <span>💧 {p.humidity != null ? `${p.humidity.toFixed(0)}%` : "–"}</span>
                      <span className="text-slate-500">·</span>
                      <span>💨 {p.windSpeed != null ? `${p.windSpeed.toFixed(0)}k` : "–"}</span>
                    </div>
                  )}

                  {/* Update Time */}
                  {p.observedAt && (
                    <div className="text-[8.5px] text-slate-400 font-medium pt-0.5">
                      อัปเดต {fmtTimeTh(p.observedAt)} น.
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => router.push(`/province/${p.id}`)}
                    className="w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 py-1.5 text-[11px] font-black text-white shadow-xs transition active:scale-[0.98]"
                  >
                    ดูรายละเอียดจังหวัด &rarr;
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ── Compact Summary Card (Top Left - Full Map Only) ── */}
      {!isMiniPreview && (
        <div className="absolute left-2 top-2 z-10 pointer-events-auto transition-all duration-200">
          {showSummaryCard ? (
            <div className="max-w-[145px] rounded-xl border border-white/15 bg-slate-900/90 px-2.5 py-1.5 text-white backdrop-blur-md shadow-xl space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wide leading-tight">
                  {activeMode === "hotspot"
                    ? "จุดความร้อน"
                    : activeMode === "weather"
                    ? "อุณหภูมิเฉลี่ย"
                    : activeMode === "wind"
                    ? "ลมเฉลี่ย"
                    : activeMode === "aqi"
                    ? "AQI เฉลี่ย"
                    : "PM2.5 เฉลี่ย"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowSummaryCard(false)}
                  className="p-0.5 text-slate-500 hover:text-white transition"
                >
                  <ChevronUp size={11} />
                </button>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black tabular-nums leading-none">
                  {activeMode === "hotspot"
                    ? totalHotspots
                    : activeMode === "weather"
                    ? `${Math.round(
                        provinces.reduce((s, p) => s + (p.temperature ?? 0), 0) /
                          (provinces.filter((p) => p.temperature != null).length || 1)
                      )}°`
                    : activeMode === "wind"
                    ? `${windSpeed}`
                    : activeMode === "aqi"
                    ? Math.round(avgPm25 * 2.2)
                    : fmtPm25(avgPm25)}
                </span>
                <span className="text-[9px] font-bold text-slate-400">
                  {activeMode === "hotspot"
                    ? "จุด"
                    : activeMode === "weather"
                    ? "C"
                    : activeMode === "wind"
                    ? "km/h"
                    : activeMode === "aqi"
                    ? "AQI"
                    : "µg/m³"}
                </span>
              </div>

              {activeMode === "hotspot" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-600/90 px-1.5 py-[1px] text-[8px] font-black text-white">
                  <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                  {provincesWithHotspots} จว.
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[8px] font-black text-white"
                    style={{ backgroundColor: avgBand.color }}
                  >
                    <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                    {avgBand.labelTh}
                  </span>
                  <span className="text-[8px] font-semibold text-slate-400">
                    เกิน {exceededCount} จว.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSummaryCard(true)}
              className="flex items-center gap-1 rounded-xl border border-white/20 bg-slate-900/90 px-2 py-1 text-[9.5px] font-black text-white backdrop-blur-md shadow-lg hover:bg-slate-800 transition"
            >
              {activeMode === "hotspot" ? (
                <>
                  <Flame size={10} className="text-orange-500 fill-orange-500" />
                  <span>🔥 {totalHotspots}</span>
                </>
              ) : (
                <>
                  <Activity size={10} className="text-blue-400" />
                  <span>{fmtPm25(avgPm25)}</span>
                </>
              )}
              <ChevronDown size={11} />
            </button>
          )}
        </div>
      )}

      {/* ── Compact Legend (Bottom Right - Full Map Only) ── */}
      {!isMiniPreview && (
        <div className="absolute right-2 bottom-2 z-10 hidden sm:block pointer-events-auto transition-all duration-200">
          {showLegendCard ? (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-2 text-[8.5px] backdrop-blur-md shadow-lg text-zinc-900 dark:text-zinc-100 space-y-1">
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-0.5">
                <span className="font-black text-[9.5px]">
                  {activeMode === "hotspot" ? "จุดความร้อน" : "ระดับ AQI"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowLegendCard(false)}
                  className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition"
                >
                  <ChevronDown size={11} />
                </button>
              </div>

              {activeMode === "hotspot" ? (
                <div className="space-y-0.5 font-bold">
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-600 shrink-0" />
                    <span>มีจุดความร้อน</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                    <span>ไม่มี (0)</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-0.5 font-bold">
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>ดีมาก</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>ปานกลาง</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime-500 shrink-0" />
                    <span>ดี</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                    <span>มีผลกระทบ</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                    <span>อันตราย</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-600 shrink-0" />
                    <span>วิกฤต</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLegendCard(true)}
              className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 px-2 py-1 text-[9.5px] font-bold text-zinc-700 dark:text-zinc-300 backdrop-blur-md shadow-lg hover:bg-white dark:hover:bg-zinc-900 transition"
            >
              <Palette size={10} className="text-zinc-500" />
              <span>เกณฑ์</span>
              <ChevronUp size={11} />
            </button>
          )}
        </div>
      )}

      {/* Scale Bar (Full Map Only) */}
      {!isMiniPreview && (
        <div className="absolute left-2 bottom-2 z-10 bg-slate-900/80 backdrop-blur-xs px-1.5 py-0.5 rounded-md text-[8px] font-black text-white border border-white/15">
          50 km —
        </div>
      )}
    </div>
  );
}
