"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { ChevronUp, ChevronDown, Plus, Minus, Target, Wind, Activity, Palette, Flame } from "lucide-react";
import { ISAN_BOUNDS, ISAN_CENTER } from "@/lib/isan";
import { fmtPm25, fmtTimeTh } from "@/lib/format";
import { bandForAqi, bandForPm25 } from "@/lib/aqi";
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
function createProvinceMarkerIcon(p: MapProvince, displayValue: number, isSelected: boolean) {
  const color = p.color || "#10b981";

  const html = `
    <div className="flex flex-col items-center justify-center cursor-pointer group" style="transform: translate(-50%, -50%);">
      <!-- Circular Value Marker with Outer Aura -->
      <div style="
        background-color: ${color};
        width: ${isSelected ? "42px" : "36px"};
        height: ${isSelected ? "42px" : "36px"};
        border-radius: 9999px;
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 15px ${color}99, 0 4px 10px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 900;
        font-size: ${displayValue >= 100 ? "13px" : "14px"};
        font-family: inherit;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      ">
        ${displayValue}
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
    iconSize: [40, 50],
    iconAnchor: [20, 20],
  });
}

/** Sample satellite hotspot positions in Isan region */
const SAMPLE_HOTSPOTS = [
  { id: "h1", lat: 16.43, lon: 102.83, name: "ขอนแก่น (ต.บ้านเป็ด)" },
  { id: "h2", lat: 17.38, lon: 104.78, name: "นครพนม (ต.ท่าอุเทน)" },
  { id: "h3", lat: 15.23, lon: 104.85, name: "อุบลราชธานี (ต.เมืองเดช)" },
  { id: "h4", lat: 16.88, lon: 103.88, name: "สกลนคร (ต.พรรณานิคม)" },
  { id: "h5", lat: 17.88, lon: 103.55, name: "บึงกาฬ (ต.โซ่พิสัย)" },
  { id: "h6", lat: 14.88, lon: 103.10, name: "บุรีรัมย์ (ต.ประโคนชัย)" },
];

/** Create clean SVG Flame Vector Marker for satellite hotspots */
function createHotspotIcon() {
  const html = `
    <div style="
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      background: radial-gradient(circle, rgba(239,68,68,0.95) 0%, rgba(249,115,22,0.7) 60%, rgba(239,68,68,0) 100%);
      border-radius: 9999px;
      box-shadow: 0 0 12px rgba(239,68,68,0.8);
    ">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" stroke="#ef4444" stroke-width="1.5">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: "custom-hotspot-marker",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function IsanMap({
  provinces,
  activeMode = "pm25",
  selectedProvinceId = "all",
  avgPm25 = 42,
  exceededCount = 3,
  windSpeed = 8,
  windDirection = "ตะวันออกเฉียงเหนือ",
}: {
  provinces: MapProvince[];
  activeMode?: MapFilterMode;
  selectedProvinceId?: string;
  avgPm25?: number;
  exceededCount?: number;
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

        {/* 20 Province Markers with Numeric Value inside Circle + Name Label below */}
        {provinces.map((p) => {
          const displayValue =
            activeMode === "aqi"
              ? p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)
              : Math.round(p.pm25 ?? 0);

          const isSelected = p.id === selectedProvinceId;
          const markerIcon = createProvinceMarkerIcon(p, displayValue, isSelected);

          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={markerIcon}
            >
              {/* Click Popup Card */}
              <Popup className="custom-province-popup">
                <div className="p-2 min-w-[210px] space-y-2 text-zinc-900">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black">{p.nameTh}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-black text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.labelTh}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 font-black">
                    <span className="text-xs text-zinc-500">PM2.5</span>
                    <span className="text-xl text-zinc-900">{fmtPm25(p.pm25)} µg/m³</span>
                    <span className="text-xs text-zinc-500 ml-auto">AQI {p.aqi ?? 0}</span>
                  </div>

                  {p.temperature != null && (
                    <div className="flex items-center gap-3 text-[11px] font-bold text-zinc-600 border-t border-zinc-100 pt-1.5">
                      <span>🌡️ {p.temperature.toFixed(0)}°C</span>
                      {p.humidity != null && <span>💧 {p.humidity.toFixed(0)}%</span>}
                      {p.windSpeed != null && <span>💨 {p.windSpeed.toFixed(0)} km/h</span>}
                    </div>
                  )}

                  {p.observedAt && (
                    <span className="block text-[9px] text-zinc-400 font-medium">
                      🕒 อัปเดต {fmtTimeTh(p.observedAt)} น.
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/province/${p.id}`)}
                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-700 pt-1 block"
                  >
                    ดูรายละเอียดจังหวัด &rarr;
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Hotspot Flame Vector Markers */}
        {(activeMode === "hotspot" || activeMode === "pm25") &&
          SAMPLE_HOTSPOTS.map((h) => (
            <Marker key={h.id} position={[h.lat, h.lon]} icon={createHotspotIcon()}>
              <Popup>
                <div className="p-1.5 text-xs font-bold">
                  <div className="flex items-center gap-1 text-red-600">
                    <Flame size={14} className="fill-red-600" />
                    <span>จุดความร้อน (Hotspot)</span>
                  </div>
                  <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">{h.name}</span>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      {/* Floating Overlay Card 1: Top Left Regional Summary (z-10) */}
      <div className="absolute left-3 top-3 z-10 pointer-events-auto transition-all duration-300">
        {showSummaryCard ? (
          <div className="max-w-[210px] sm:max-w-xs rounded-2xl border border-white/20 bg-slate-900/90 p-3 sm:p-4 text-white backdrop-blur-md shadow-2xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-300 uppercase tracking-wide">
                PM2.5 เฉลี่ยภาคอีสาน
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
                {fmtPm25(avgPm25)}
              </span>
              <span className="text-xs font-bold text-slate-300">µg/m³</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
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
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSummaryCard(true)}
            title="ขยายการ์ดสรุป PM2.5"
            className="flex items-center gap-1.5 rounded-2xl border border-white/30 bg-slate-900/90 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md shadow-xl hover:bg-slate-800 transition"
          >
            <Activity size={13} className="text-blue-400" />
            <span>PM2.5 เฉลี่ย {fmtPm25(avgPm25)}</span>
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
            <Wind size={13} className="text-teal-400" />
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
              <span className="font-black text-xs">ระดับคุณภาพอากาศ (AQI)</span>
              <button
                type="button"
                onClick={() => setShowLegendCard(false)}
                title="ย่อสัญลักษณ์สี"
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition"
              >
                <ChevronDown size={14} />
              </button>
            </div>

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
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLegendCard(true)}
            title="แสดงเกณฑ์ AQI"
            className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 px-3 py-1.5 text-xs font-black text-zinc-900 dark:text-zinc-100 backdrop-blur-md shadow-xl hover:bg-zinc-100 transition"
          >
            <Palette size={13} className="text-emerald-500" />
            <span>เกณฑ์ AQI</span>
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
