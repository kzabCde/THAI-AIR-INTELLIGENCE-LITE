"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import type { ProvinceSnapshot } from "@/types/air";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const ProvinceDotLayer = dynamic(
  () => import("./province-dot-layer").then((m) => m.ProvinceDotLayer),
  { ssr: false }
);
const HotspotLayer = dynamic(
  () => import("./hotspot-layer").then((m) => m.HotspotLayer),
  { ssr: false }
);

type LayerType = "pm25" | "aqi" | "weather";

interface Props {
  provinces: ProvinceSnapshot[];
  onSelect?: (slug: string) => void;
  height?: string;
}

export function InteractiveMap({ provinces, onSelect, height = "500px" }: Props) {
  const [activeLayer, setActiveLayer] = useState<LayerType>("pm25");
  const [showHotspots, setShowHotspots] = useState(true);

  const hotspots = useMemo(() =>
    provinces.map((p) => ({
      lat: p.latitude,
      lon: p.longitude,
      province: p.province_name_th,
      count: p.hotspot_count,
    })),
    [provinces]
  );

  const LAYERS: { key: LayerType; label: string }[] = [
    { key: "pm25", label: "PM2.5" },
    { key: "aqi", label: "AQI" },
    { key: "weather", label: "อุณหภูมิ" },
  ];

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-900/80">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Layer:</span>
        {LAYERS.map((l) => (
          <button
            key={l.key}
            onClick={() => setActiveLayer(l.key)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              activeLayer === l.key
                ? "bg-sky-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {l.label}
          </button>
        ))}
        <button
          onClick={() => setShowHotspots((v) => !v)}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
            showHotspots ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
          }`}
        >
          🔥 Hotspot
        </button>
      </div>

      <div style={{ height }} className="z-0 overflow-hidden rounded-2xl border shadow-sm">
        <MapContainer
          center={[13.0, 101.5]}
          zoom={6}
          style={{ width: "100%", height: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://openstreetmap.org">OSM</a>'
          />
          {provinces.length > 0 && (
            <ProvinceDotLayer
              provinces={provinces}
              onSelect={onSelect}
              layer={activeLayer}
            />
          )}
          {showHotspots && hotspots.length > 0 && (
            <HotspotLayer hotspots={hotspots} />
          )}
        </MapContainer>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { color: "#00e400", label: "ดีมาก (≤12)" },
          { color: "#ca8a04", label: "ดี (≤35)" },
          { color: "#ff7e00", label: "ปานกลาง (≤55)" },
          { color: "#ff0000", label: "ไม่ดี (≤150)" },
          { color: "#8f3f97", label: "อันตราย (>150)" },
        ].map((b) => (
          <div key={b.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="text-slate-600 dark:text-slate-400">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
