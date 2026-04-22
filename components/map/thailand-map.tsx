"use client";

import { motion } from "framer-motion";
import { useMemo, useState, type WheelEventHandler } from "react";
import type { ProvinceSnapshot } from "@/types/air";

function mapColor(pm25: number) {
  if (pm25 <= 25) return "#16a34a";
  if (pm25 <= 50) return "#facc15";
  if (pm25 <= 75) return "#f97316";
  if (pm25 <= 100) return "#ef4444";
  return "#581c87";
}

type ThailandMapProps = {
  rows: ProvinceSnapshot[];
  dayIndex: number;
  search: string;
  selectedSlug: string | null;
  timelineByProvince: Record<string, number[]>;
  onSelect: (slug: string) => void;
};

type HoveredState = { x: number; y: number; name: string; pm25: number } | null;

export function ThailandMap({ rows, dayIndex, search, selectedSlug, timelineByProvince, onSelect }: ThailandMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<HoveredState>(null);

  const projected = useMemo(() => {
    if (!rows.length) return [];
    const lats = rows.map((x) => x.latitude);
    const lons = rows.map((x) => x.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return rows.map((x) => {
      const px = ((x.longitude - minLon) / (maxLon - minLon)) * 620 + 40;
      const py = ((maxLat - x.latitude) / (maxLat - minLat)) * 880 + 30;
      return { ...x, px, py, pm: timelineByProvince[x.slug]?.[dayIndex] ?? x.air.pm25 };
    });
  }, [dayIndex, rows, timelineByProvince]);

  const onWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setZoom((prev) => Math.max(0.8, Math.min(2.6, prev + (event.deltaY > 0 ? -0.08 : 0.08))));
  };

  const matchesSearch = (name: string) => search && name.toLowerCase().includes(search.toLowerCase());

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-3xl border border-white/30 bg-gradient-to-br from-sky-200/20 via-indigo-200/10 to-fuchsia-200/10 p-2 shadow-2xl shadow-slate-900/20 dark:border-white/10 dark:from-sky-800/20 dark:via-indigo-900/20"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_20%,#38bdf833,transparent_30%),radial-gradient(circle_at_80%_30%,#a855f733,transparent_35%),radial-gradient(circle_at_50%_90%,#22c55e22,transparent_40%)]" />

      <div
        className="relative h-[62vh] w-full cursor-grab overflow-hidden rounded-2xl active:cursor-grabbing md:h-[76vh]"
        onWheel={onWheel}
        onMouseDown={() => setDragging(true)}
        onMouseUp={() => setDragging(false)}
        onMouseMove={(event) => {
          if (dragging) {
            setPan((prev) => ({ x: prev.x + event.movementX, y: prev.y + event.movementY }));
          }
        }}
      >
        <svg
          viewBox="0 0 700 960"
          className="h-full w-full transition-transform duration-200"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {projected.map((province) => {
            const active = province.slug === selectedSlug || matchesSearch(province.province_name_en);
            const size = active ? 14 : 10;
            const isDanger = province.pm > 100;
            const points = `${province.px},${province.py - size} ${province.px + size},${province.py - 3} ${province.px + size - 3},${province.py + size} ${province.px - size + 3},${province.py + size} ${province.px - size},${province.py - 3}`;

            return (
              <g key={province.slug}>
                {isDanger && <circle cx={province.px} cy={province.py} r={size + 6} fill="#f43f5e33" className="animate-pulse" />}
                <polygon
                  points={points}
                  fill={mapColor(province.pm)}
                  stroke={active ? "#f8fafc" : "rgba(255,255,255,0.55)"}
                  strokeWidth={active ? 2 : 1}
                  className="cursor-pointer transition-all duration-200 hover:brightness-110"
                  style={{ filter: active ? "drop-shadow(0 0 10px rgba(59,130,246,0.75))" : "none" }}
                  onClick={() => onSelect(province.slug)}
                  onMouseEnter={(event) => {
                    setHovered({
                      x: event.clientX,
                      y: event.clientY,
                      name: province.province_name_en,
                      pm25: province.pm,
                    });
                  }}
                  onMouseMove={(event) => {
                    setHovered((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
                  }}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-white/40 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          <p className="font-semibold">{hovered.name}</p>
          <p>PM2.5: {hovered.pm25.toFixed(1)} μg/m³</p>
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex gap-2">
        <button onClick={() => setZoom((z) => Math.min(2.6, z + 0.15))} className="rounded-lg border border-white/40 bg-slate-900/60 px-2 py-1 text-sm text-white">+</button>
        <button onClick={() => setZoom((z) => Math.max(0.8, z - 0.15))} className="rounded-lg border border-white/40 bg-slate-900/60 px-2 py-1 text-sm text-white">−</button>
      </div>
    </motion.div>
  );
}
