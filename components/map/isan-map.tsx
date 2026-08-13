"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ChevronUp, ChevronDown, Plus, Minus, Target, Flame, Activity, Palette } from "lucide-react";
import { ISAN_BOUNDS, ISAN_CENTER } from "@/lib/isan";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import { bandForPm25 } from "@/lib/aqi";
import type { MapProvince, MapFilterMode } from "./types";

// Ensure default Leaflet marker assets load safely
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/** Helper component to fly/pan map to selected province or center */
function MapViewHandler({ selectedProvince }: { selectedProvince?: MapProvince }) {
  const map = useMap();
  useEffect(() => {
    if (selectedProvince) {
      map.flyTo([selectedProvince.lat, selectedProvince.lon], 9, { duration: 1.2 });
    }
  }, [selectedProvince, map]);
  return null;
}

/** Map Floating Custom Zoom Controls (Right Top Side with z-10) */
function CustomZoomControls() {
  const map = useMap();

  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
      {/* Zoom In Button */}
      <button
        type="button"
        onClick={() => map.zoomIn()}
        title="ซูมเข้า (+)"
        className="flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-800 dark:text-zinc-100 shadow-lg backdrop-blur-md hover:bg-white transition"
      >
        <Plus size={16} />
      </button>

      {/* Zoom Out Button */}
      <button
        type="button"
        onClick={() => map.zoomOut()}
        title="ซูมออก (-)"
        className="flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-800 dark:text-zinc-100 shadow-lg backdrop-blur-md hover:bg-white transition"
      >
        <Minus size={16} />
      </button>

      {/* Reset View Center Button */}
      <button
        type="button"
        onClick={() => map.flyTo(ISAN_CENTER, 7, { duration: 1.2 })}
        title="กลับสู่กึ่งกลางภาคอีสาน"
        className="flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-blue-600 dark:text-blue-400 shadow-lg backdrop-blur-md hover:bg-white transition mt-1"
      >
        <Target size={16} />
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
    iconHtml = count > 0 ? `<span style="margin-right:2px; font-size:12px;">🔥</span>` : "";
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

  const html = `
    <div className="flex flex-col items-center justify-center cursor-pointer group" style="transform: translate(-50%, -50%);">
      <!-- Circular Value Marker with Outer Aura -->
      <div style="
        background-color: ${color};
        width: ${isSelected ? "44px" : "38px"};
        height: ${isSelected ? "44px" : "38px"};
        border-radius: 9999px;
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 15px ${color}aa, 0 4px 10px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 900;
        font-size: ${displayValue.length >= 3 ? "11px" : "13px"};
        font-family: inherit;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      ">
        ${iconHtml}${displayValue}
      </div>

      <!-- Province Name Label directly beneath marker -->
      <span style="
        margin-top: 3px;
        color: #ffffff;
        font-weight: 800;
        font-size: 11px;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8);
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
    iconSize: [44, 54],
    iconAnchor: [22, 22],
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
}: {
  provinces: MapProvince[];
  activeMode?: MapFilterMode;
  selectedProvinceId?: string;
  avgPm25?: number;
  exceededCount?: number;
  totalHotspots?: number;
  windSpeed?: number;
  windDirection?: string;
}) {
  const router = useRouter();
  const selectedProvince = provinces.find((p) => p.id === selectedProvinceId);
  const avgBand = bandForPm25(avgPm25);

  // States for Collapsible Floating Overlay Cards
  const [showSummaryCard, setShowSummaryCard] = useState(true);
  const [showWindCard, setShowWindCard] = useState(true);
  const [showLegendCard, setShowLegendCard] = useState(true);

  const provincesWithHotspots = provinces.filter((p) => (p.hotspots ?? 0) > 0).length;

  return (
    <div className="relative w-full h-full min-h-[560px] rounded-3xl overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800">
      <MapContainer
        center={ISAN_CENTER}
        zoom={7}
        minZoom={6}
        maxBounds={ISAN_BOUNDS}
        maxBoundsViscosity={0.8}
        scrollWheelZoom={true}
        zoomControl={false}
        className="h-full w-full z-0"
        preferCanvas
      >
        {/* Fly to selected province handler */}
        <MapViewHandler selectedProvince={selectedProvince} />

        {/* Custom Zoom Controls UI (z-10) */}
        <CustomZoomControls />

        {/* Base Tile Layer: Google Maps Hybrid Satellite */}
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          subdomains={["mt0", "mt1", "mt2", "mt3"]}
          maxZoom={20}
        />

        {/* 20 Province Markers adapted to activeMode */}
        {provinces.map((p) => {
          const isSelected = p.id === selectedProvinceId;
          const markerIcon = createProvinceMarkerIcon(p, isSelected, activeMode);

          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={markerIcon}
            >
              {/* Click Popup Card */}
              <Popup className="custom-province-popup">
                <div className="w-[230px] rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 space-y-2.5">
                  {/* Header: Province Name + Level Badge */}
                  <div className="flex items-center justify-between min-w-0">
                    <span className="text-base font-black text-zinc-900 dark:text-white truncate">
                      {p.nameTh}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-black text-white shadow-2xs shrink-0"
                      style={{ backgroundColor: activeMode === "hotspot" && (p.hotspots ?? 0) > 0 ? "#ea580c" : p.color }}
                    >
                      {activeMode === "hotspot" ? `🔥 ${p.hotspots ?? 0} จุด` : p.labelTh}
                    </span>
                  </div>

                  {/* Main Reading Row: PM2.5 + AQI */}
                  <div className="flex items-baseline justify-between rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800">
                    <div>
                      <span className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">PM2.5</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums leading-none">
                          {fmtPm25(p.pm25)}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-500">µg/m³</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-black text-zinc-400 uppercase block tracking-wider">AQI</span>
                      <span className="text-xl font-black text-zinc-900 dark:text-white tabular-nums leading-none">
                        {p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)}
                      </span>
                    </div>
                  </div>

                  {/* FIRMS Hotspots Pill */}
                  <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60">
                    <span className="flex items-center gap-1.5 text-[11px]">🔥 จุดความร้อน (FIRMS)</span>
                    <span className="text-xs font-black tabular-nums">{p.hotspots ?? 0} จุด</span>
                  </div>

                  {/* Weather Capsule Grid */}
                  {p.temperature != null && (
                    <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold border-t border-zinc-100 dark:border-zinc-800/80 pt-2">
                      <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-1 text-orange-700 dark:text-orange-300">
                        <span className="block text-[9px] text-zinc-400 font-semibold">อุณหภูมิ</span>
                        <span>{p.temperature.toFixed(0)}°C</span>
                      </div>
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-1 text-blue-700 dark:text-blue-300">
                        <span className="block text-[9px] text-zinc-400 font-semibold">ความชื้น</span>
                        <span>{p.humidity != null ? `${p.humidity.toFixed(0)}%` : "–"}</span>
                      </div>
                      <div className="rounded-lg bg-teal-50 dark:bg-teal-950/30 p-1 text-teal-700 dark:text-teal-300">
                        <span className="block text-[9px] text-zinc-400 font-semibold">ลม</span>
                        <span>{p.windSpeed != null ? `${p.windSpeed.toFixed(0)} km/h` : "–"}</span>
                      </div>
                    </div>
                  )}

                  {/* Update Time */}
                  {p.observedAt && (
                    <div className="flex items-center justify-between text-[9.5px] text-zinc-400 font-medium pt-0.5">
                      <span>อัปเดต {fmtTimeTh(p.observedAt)} น.</span>
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => router.push(`/province/${p.id}`)}
                    className="w-full flex items-center justify-center gap-1 rounded-xl bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 py-2 text-xs font-black text-white shadow-xs transition active:scale-98"
                  >
                    <span>ดูรายละเอียดจังหวัด</span>
                    <span>&rarr;</span>
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Overlay Card 1: Top Left Regional Summary (z-10) */}
      <div className="absolute left-3 top-3 z-10 pointer-events-auto transition-all duration-300">
        {showSummaryCard ? (
          <div className="max-w-[210px] sm:max-w-xs rounded-2xl border border-white/20 bg-slate-900/90 p-3 sm:p-4 text-white backdrop-blur-md shadow-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-300 uppercase tracking-wide">
                {activeMode === "hotspot"
                  ? "จุดความร้อนภาคอีสาน (FIRMS)"
                  : activeMode === "weather"
                  ? "สภาพอากาศภาคอีสาน"
                  : activeMode === "wind"
                  ? "ความเร็วลมภาคอีสาน"
                  : activeMode === "aqi"
                  ? "AQI เฉลี่ยภาคอีสาน"
                  : "PM2.5 เฉลี่ยภาคอีสาน"}
              </span>
              <button
                type="button"
                onClick={() => setShowSummaryCard(false)}
                title="ย่อการ์ดสรุป"
                className="p-1 text-slate-400 hover:text-white transition"
              >
                <ChevronUp size={14} />
              </button>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black tabular-nums leading-none">
                {activeMode === "hotspot"
                  ? totalHotspots
                  : activeMode === "weather"
                  ? `${Math.round(provinces.reduce((sum, p) => sum + (p.temperature ?? 0), 0) / (provinces.filter((p) => p.temperature != null).length || 1))}°C`
                  : activeMode === "wind"
                  ? `${windSpeed}`
                  : activeMode === "aqi"
                  ? Math.round(avgPm25 * 2.2)
                  : fmtPm25(avgPm25)}
              </span>
              <span className="text-xs font-bold text-slate-300">
                {activeMode === "hotspot"
                  ? "จุด"
                  : activeMode === "weather"
                  ? ""
                  : activeMode === "wind"
                  ? "km/h"
                  : activeMode === "aqi"
                  ? "AQI"
                  : "µg/m³"}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              {activeMode === "hotspot" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  พบจุดความร้อน {provincesWithHotspots} จังหวัด
                </span>
              ) : (
                <>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow-xs"
                    style={{ backgroundColor: avgBand.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    {avgBand.labelTh}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-300">
                    เกินเกณฑ์ {exceededCount} จังหวัด
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSummaryCard(true)}
            title="ขยายการ์ดสรุป"
            className="flex items-center gap-1.5 rounded-2xl border border-white/30 bg-slate-900/90 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md shadow-xl hover:bg-slate-800 transition"
          >
            {activeMode === "hotspot" ? (
              <>
                <Flame size={13} className="text-orange-500 fill-orange-500" />
                <span>จุดความร้อน {totalHotspots} จุด</span>
              </>
            ) : (
              <>
                <Activity size={13} className="text-blue-400" />
                <span>PM2.5 เฉลี่ย {fmtPm25(avgPm25)}</span>
              </>
            )}
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Floating Overlay Card 2: Top Right Wind Info (z-10) */}
      <div className="absolute right-14 top-3 z-10 hidden sm:block pointer-events-auto transition-all duration-300">
        {showWindCard ? (
          <div className="max-w-[180px] rounded-2xl border border-white/20 bg-slate-900/90 p-3 text-white backdrop-blur-md shadow-2xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">
                ลมปัจจุบัน
              </span>
              <button
                type="button"
                onClick={() => setShowWindCard(false)}
                title="ย่อการ์ดลม"
                className="p-1 text-slate-400 hover:text-white transition"
              >
                <ChevronUp size={14} />
              </button>
            </div>

            <span className="block text-xs font-black text-white truncate">
              {windDirection}
            </span>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-xs font-extrabold text-teal-400 tabular-nums">
                {windSpeed} km/h
              </span>
              <svg className="w-7 h-3.5 text-teal-400 opacity-90" viewBox="0 0 40 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M 0 5 Q 20 0 40 5" strokeLinecap="round" />
                <path d="M 5 12 Q 22 8 35 12" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowWindCard(true)}
            title="ขยายการ์ดลม"
            className="flex items-center gap-1.5 rounded-2xl border border-white/30 bg-slate-900/90 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md shadow-xl hover:bg-slate-800 transition"
          >
            <span>{windSpeed} km/h</span>
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Floating Overlay Card 3: Bottom Right AQI Scale Legend (z-10) */}
      <div className="absolute right-3 bottom-3 z-10 hidden sm:block pointer-events-auto transition-all duration-300">
        {showLegendCard ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-3 text-[10px] backdrop-blur-md shadow-xl text-zinc-900 dark:text-zinc-100 space-y-1.5">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1">
              <span className="font-black text-xs">
                {activeMode === "hotspot" ? "สัญลักษณ์จุดความร้อน (FIRMS)" : "ระดับคุณภาพอากาศ (AQI)"}
              </span>
              <button
                type="button"
                onClick={() => setShowLegendCard(false)}
                title="ย่อสัญลักษณ์"
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {activeMode === "hotspot" ? (
              <div className="space-y-1 font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-600 shrink-0" />
                  <span>มีจุดความร้อน (🔥 FIRMS)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-600 shrink-0" />
                  <span>ไม่มีจุดความร้อน (0 จุด)</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>ดีมาก</span>
                  <span className="text-zinc-400 font-normal ml-auto">0-25</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                  <span>ปานกลาง</span>
                  <span className="text-zinc-400 font-normal ml-auto">51-100</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-lime-500 shrink-0" />
                  <span>ดี</span>
                  <span className="text-zinc-400 font-normal ml-auto">26-50</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                  <span>เริ่มมีผลกระทบ</span>
                  <span className="text-zinc-400 font-normal ml-auto">101+</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                  <span>มีผลกระทบ</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600 shrink-0" />
                  <span>อันตรายมาก</span>
                  <span className="text-zinc-400 font-normal ml-auto">301+</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLegendCard(true)}
            title="แสดงสัญลักษณ์"
            className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 px-3 py-1.5 text-xs font-black text-zinc-900 dark:text-zinc-100 backdrop-blur-md shadow-xl hover:bg-zinc-100 transition"
          >
            <Palette size={13} className="text-emerald-500" />
            <span>คำอธิบายสัญลักษณ์</span>
            <ChevronUp size={14} />
          </button>
        )}
      </div>

      {/* Floating Scale Bar (Bottom Left with z-10) */}
      <div className="absolute left-3 bottom-3 z-10 bg-slate-900/80 backdrop-blur-xs px-2.5 py-1 rounded-xl text-[10px] font-black text-white border border-white/20">
        50 km —
      </div>
    </div>
  );
}
