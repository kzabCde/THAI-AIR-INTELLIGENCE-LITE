"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { ChevronUp, ChevronDown, Plus, Minus, Target, Flame, Activity, Palette, X } from "lucide-react";
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

/** Helper component to fly/pan map to a province */
function MapFlyTo({ province }: { province?: MapProvince }) {
  const map = useMap();
  useEffect(() => {
    if (province) {
      map.flyTo([province.lat, province.lon], 9, { duration: 1.0 });
    }
  }, [province, map]);
  return null;
}

/** Map Floating Custom Zoom Controls */
function CustomZoomControls() {
  const map = useMap();
  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 pointer-events-auto">
      <button type="button" onClick={() => map.zoomIn()} title="ซูมเข้า"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-800 dark:text-zinc-100 shadow-lg backdrop-blur-md hover:bg-white transition">
        <Plus size={14} />
      </button>
      <button type="button" onClick={() => map.zoomOut()} title="ซูมออก"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-800 dark:text-zinc-100 shadow-lg backdrop-blur-md hover:bg-white transition">
        <Minus size={14} />
      </button>
      <button type="button" onClick={() => map.flyTo(ISAN_CENTER, 7, { duration: 1.0 })} title="กลับกึ่งกลาง"
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-blue-600 dark:text-blue-400 shadow-lg backdrop-blur-md hover:bg-white transition mt-0.5">
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

  const circleSize = isSelected ? 42 : 36;
  const html = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 64px; cursor: pointer;">
      <div style="
        background-color: ${color};
        width: ${circleSize}px;
        height: ${circleSize}px;
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
      <span style="
        margin-top: 2px;
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
    iconSize: [64, 56],
    iconAnchor: [32, circleSize / 2],
  });
}

/* ─── Compact Floating Province Detail Card (centered bottom) ─── */
function ProvinceFloatingCard({
  province,
  activeMode,
  onClose,
  onNavigate,
}: {
  province: MapProvince;
  activeMode: MapFilterMode;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const p = province;
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="w-[260px] sm:w-[280px] rounded-2xl border border-white/20 bg-slate-900/95 backdrop-blur-md text-white p-2.5 shadow-2xl space-y-1.5">
        {/* Header: Name + Badge + Close */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-black truncate">{p.nameTh}</span>
            <span
              className="rounded-full px-1.5 py-[1px] text-[8px] font-black text-white shrink-0"
              style={{ backgroundColor: activeMode === "hotspot" && (p.hotspots ?? 0) > 0 ? "#ea580c" : p.color }}
            >
              {activeMode === "hotspot" ? `🔥${p.hotspots ?? 0}` : p.labelTh}
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-0.5 text-slate-400 hover:text-white transition shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* PM2.5 + AQI + Hotspots — Single compact row */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1">
            <div>
              <span className="text-[8px] font-bold text-slate-400 uppercase block">PM2.5</span>
              <span className="text-base font-black tabular-nums leading-none">{fmtPm25(p.pm25)}</span>
            </div>
            <div className="w-px h-6 bg-white/20" />
            <div>
              <span className="text-[8px] font-bold text-slate-400 uppercase block">AQI</span>
              <span className="text-base font-black tabular-nums leading-none">{p.aqi ?? Math.round((p.pm25 ?? 0) * 2.2)}</span>
            </div>
            <div className="w-px h-6 bg-white/20" />
            <div>
              <span className="text-[8px] font-bold text-amber-400 uppercase block">🔥FIRMS</span>
              <span className="text-base font-black tabular-nums leading-none">{p.hotspots ?? 0}<span className="text-[8px] font-bold text-slate-400 ml-0.5">จุด</span></span>
            </div>
          </div>
        </div>

        {/* Weather row — ultra compact inline */}
        {p.temperature != null && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 px-0.5">
            <span>🌡{p.temperature.toFixed(0)}°C</span>
            <span className="text-slate-600">·</span>
            <span>💧{p.humidity != null ? `${p.humidity.toFixed(0)}%` : "–"}</span>
            <span className="text-slate-600">·</span>
            <span>💨{p.windSpeed != null ? `${p.windSpeed.toFixed(0)} km/h` : "–"}</span>
            {p.observedAt && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{fmtTimeTh(p.observedAt)}</span>
              </>
            )}
          </div>
        )}

        {/* Action Button */}
        <button
          type="button"
          onClick={() => onNavigate(p.id)}
          className="w-full flex items-center justify-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 py-1.5 text-[11px] font-black text-white shadow-xs transition active:scale-[0.98]"
        >
          ดูรายละเอียดจังหวัด →
        </button>
      </div>
    </div>
  );
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

  // Tapped province for the floating detail card
  const [tappedProvince, setTappedProvince] = useState<MapProvince | null>(null);

  // States for Collapsible Floating Overlay Cards
  const [showSummaryCard, setShowSummaryCard] = useState(true);
  const [showLegendCard, setShowLegendCard] = useState(false);

  const provincesWithHotspots = provinces.filter((p) => (p.hotspots ?? 0) > 0).length;

  const handleMarkerClick = useCallback((p: MapProvince) => {
    setTappedProvince(p);
  }, []);

  const handleCloseCard = useCallback(() => {
    setTappedProvince(null);
  }, []);

  const handleNavigate = useCallback((id: string) => {
    router.push(`/province/${id}`);
  }, [router]);

  // Also fly to province selected from dropdown
  const flyTarget = tappedProvince ?? selectedProvince;

  return (
    <div className="relative w-full h-full min-h-[560px] rounded-3xl overflow-hidden shadow-lg border border-zinc-200 dark:border-zinc-800">
      <MapContainer
        center={ISAN_CENTER}
        zoom={7}
        minZoom={5}
        scrollWheelZoom={true}
        zoomControl={false}
        className="h-full w-full z-0"
        preferCanvas
      >
        {/* Fly to selected/tapped province */}
        <MapFlyTo province={flyTarget} />

        {/* Custom Zoom Controls */}
        <CustomZoomControls />

        {/* Base Tile Layer */}
        <TileLayer
          attribution='&copy; Google Maps'
          url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          subdomains={["mt0", "mt1", "mt2", "mt3"]}
          maxZoom={20}
        />

        {/* Province Markers — click opens floating card, no Leaflet popup */}
        {provinces.map((p) => {
          const isSelected = p.id === tappedProvince?.id || p.id === selectedProvinceId;
          const markerIcon = createProvinceMarkerIcon(p, isSelected, activeMode);

          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lon]}
              icon={markerIcon}
              eventHandlers={{ click: () => handleMarkerClick(p) }}
            />
          );
        })}
      </MapContainer>

      {/* ── Floating Province Detail Card (bottom center) ── */}
      {tappedProvince && (
        <ProvinceFloatingCard
          province={tappedProvince}
          activeMode={activeMode}
          onClose={handleCloseCard}
          onNavigate={handleNavigate}
        />
      )}

      {/* ── Compact Summary Card (top left) ── */}
      <div className="absolute left-2 top-2 z-10 pointer-events-auto transition-all duration-200">
        {showSummaryCard ? (
          <div className="max-w-[160px] rounded-xl border border-white/15 bg-slate-900/90 px-2.5 py-2 text-white backdrop-blur-md shadow-xl space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide leading-tight">
                {activeMode === "hotspot" ? "จุดความร้อน (FIRMS)"
                  : activeMode === "weather" ? "อุณหภูมิเฉลี่ย"
                  : activeMode === "wind" ? "ลมเฉลี่ย"
                  : activeMode === "aqi" ? "AQI เฉลี่ย"
                  : "PM2.5 เฉลี่ย"}
              </span>
              <button type="button" onClick={() => setShowSummaryCard(false)} className="p-0.5 text-slate-500 hover:text-white transition">
                <ChevronUp size={12} />
              </button>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black tabular-nums leading-none">
                {activeMode === "hotspot" ? totalHotspots
                  : activeMode === "weather" ? `${Math.round(provinces.reduce((s, p) => s + (p.temperature ?? 0), 0) / (provinces.filter((p) => p.temperature != null).length || 1))}°`
                  : activeMode === "wind" ? `${windSpeed}`
                  : activeMode === "aqi" ? Math.round(avgPm25 * 2.2)
                  : fmtPm25(avgPm25)}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {activeMode === "hotspot" ? "จุด" : activeMode === "weather" ? "C" : activeMode === "wind" ? "km/h" : activeMode === "aqi" ? "AQI" : "µg/m³"}
              </span>
            </div>

            {activeMode === "hotspot" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-600/90 px-2 py-[2px] text-[9px] font-black text-white">
                <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                {provincesWithHotspots} จังหวัด
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[9px] font-black text-white"
                  style={{ backgroundColor: avgBand.color }}
                >
                  <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                  {avgBand.labelTh}
                </span>
                <span className="text-[9px] font-semibold text-slate-400">
                  เกิน {exceededCount}
                </span>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSummaryCard(true)}
            className="flex items-center gap-1 rounded-xl border border-white/20 bg-slate-900/90 px-2 py-1 text-[10px] font-black text-white backdrop-blur-md shadow-lg hover:bg-slate-800 transition"
          >
            {activeMode === "hotspot" ? (
              <><Flame size={11} className="text-orange-500 fill-orange-500" /><span>🔥 {totalHotspots}</span></>
            ) : (
              <><Activity size={11} className="text-blue-400" /><span>{fmtPm25(avgPm25)}</span></>
            )}
            <ChevronDown size={12} />
          </button>
        )}
      </div>

      {/* ── Compact Legend (bottom right) ── */}
      <div className="absolute right-2 bottom-3 z-10 hidden sm:block pointer-events-auto transition-all duration-200">
        {showLegendCard ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-2 text-[9px] backdrop-blur-md shadow-lg text-zinc-900 dark:text-zinc-100 space-y-1">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-0.5">
              <span className="font-black text-[10px]">
                {activeMode === "hotspot" ? "จุดความร้อน" : "ระดับ AQI"}
              </span>
              <button type="button" onClick={() => setShowLegendCard(false)} className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition">
                <ChevronDown size={12} />
              </button>
            </div>

            {activeMode === "hotspot" ? (
              <div className="space-y-0.5 font-bold">
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-600 shrink-0" /><span>มีจุดความร้อน</span></div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-600 shrink-0" /><span>ไม่มี (0)</span></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-bold">
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /><span>ดีมาก</span><span className="text-zinc-400 font-normal ml-auto">0-25</span></div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" /><span>ปานกลาง</span><span className="text-zinc-400 font-normal ml-auto">51-100</span></div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-lime-500 shrink-0" /><span>ดี</span><span className="text-zinc-400 font-normal ml-auto">26-50</span></div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" /><span>มีผลกระทบ</span><span className="text-zinc-400 font-normal ml-auto">101+</span></div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 shrink-0" /><span>อันตราย</span></div>
                <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-600 shrink-0" /><span>อันตรายมาก</span></div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLegendCard(true)}
            className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 px-2 py-1 text-[10px] font-black text-zinc-900 dark:text-zinc-100 backdrop-blur-md shadow-lg hover:bg-zinc-100 transition"
          >
            <Palette size={11} className="text-emerald-500" />
            <span>สัญลักษณ์</span>
            <ChevronUp size={12} />
          </button>
        )}
      </div>

      {/* Scale Bar */}
      <div className="absolute left-2 bottom-3 z-10 bg-slate-900/80 backdrop-blur-xs px-2 py-0.5 rounded-lg text-[9px] font-black text-white border border-white/15">
        50 km —
      </div>
    </div>
  );
}
