"use client";

import { motion } from "framer-motion";
import { memo, useCallback, useMemo, useRef, useState, type MouseEvent, type WheelEventHandler } from "react";
import { levelThai } from "@/lib/formatThai";
import type { ProvinceSnapshot } from "@/types/air";

function mapColor(pm25: number) {
  if (pm25 <= 25) return "#16a34a";
  if (pm25 <= 50) return "#eab308";
  if (pm25 <= 75) return "#f97316";
  if (pm25 <= 100) return "#ef4444";
  if (pm25 <= 150) return "#9333ea";
  return "#111827";
}

type ThailandMapProps = {
  rows: ProvinceSnapshot[];
  search: string;
  selectedSlug: string | null;
  pmDeltaByProvince: Record<string, number>;
  onSelect: (slug: string) => void;
};

type HoveredState = { x: number; y: number; name: string; pm25: number } | null;

type ProjectedProvince = ProvinceSnapshot & {
  px: number;
  py: number;
  size: number;
  active: boolean;
  points: string;
  delta: number;
  isDanger: boolean;
};

const ProvinceMarker = memo(function ProvinceMarker({
  province,
  onSelect,
  onHover,
  onLeave,
}: {
  province: ProjectedProvince;
  onSelect: (slug: string) => void;
  onHover: (event: MouseEvent<SVGPolygonElement>, province: ProjectedProvince) => void;
  onLeave: () => void;
}) {
  return (
    <g>
      {province.isDanger && <circle cx={province.px} cy={province.py} r={province.size + 7} fill="#ef444444" className="animate-pulse" />}
      <polygon
        points={province.points}
        fill={mapColor(province.air.pm25)}
        stroke={province.active ? "#f8fafc" : "rgba(255,255,255,0.55)"}
        strokeWidth={province.active ? 2 : 1}
        className="cursor-pointer transition-all duration-150 hover:brightness-110"
        onClick={() => onSelect(province.slug)}
        onMouseEnter={(event) => onHover(event, province)}
        onMouseMove={(event) => onHover(event, province)}
        onMouseLeave={onLeave}
      />
      {Math.abs(province.delta) >= 1 && (
        <text x={province.px + 13} y={province.py - 8} fontSize="10" fill={province.delta > 0 ? "#dc2626" : "#16a34a"}>
          {province.delta > 0 ? `▲ +${province.delta.toFixed(0)}` : `▼ ${province.delta.toFixed(0)}`}
        </text>
      )}
    </g>
  );
});

export function ThailandMap({ rows, search, selectedSlug, pmDeltaByProvince, onSelect }: ThailandMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<HoveredState>(null);
  const hoverRaf = useRef<number | null>(null);

  const searchKey = search.trim().toLowerCase();

  const projected = useMemo(() => {
    if (!rows.length) return [] as ProjectedProvince[];
    const lats = rows.map((x) => x.latitude);
    const lons = rows.map((x) => x.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return rows.map((x) => {
      const px = ((x.longitude - minLon) / (maxLon - minLon)) * 620 + 40;
      const py = ((maxLat - x.latitude) / (maxLat - minLat)) * 880 + 30;
      const active = x.slug === selectedSlug || (!!searchKey && `${x.province_name_th} ${x.province_name_en}`.toLowerCase().includes(searchKey));
      const size = active ? 14 : 10;
      return {
        ...x,
        px,
        py,
        active,
        size,
        isDanger: x.air.pm25 > 100,
        points: `${px},${py - size} ${px + size},${py - 3} ${px + size - 3},${py + size} ${px - size + 3},${py + size} ${px - size},${py - 3}`,
        delta: pmDeltaByProvince[x.slug] ?? 0,
      };
    });
  }, [rows, selectedSlug, searchKey, pmDeltaByProvince]);

  const onWheel: WheelEventHandler<HTMLDivElement> = useCallback((event) => {
    event.preventDefault();
    setZoom((prev) => Math.max(0.8, Math.min(2.6, prev + (event.deltaY > 0 ? -0.08 : 0.08))));
  }, []);

  const handleHover = useCallback((event: MouseEvent<SVGPolygonElement>, province: ProjectedProvince) => {
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = requestAnimationFrame(() => {
      setHovered({
        x: event.clientX,
        y: event.clientY,
        name: province.province_name_th,
        pm25: province.air.pm25,
      });
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/70 p-2 shadow-2xl dark:border-white/10 dark:bg-slate-950/55">
      <div className="relative h-[55vh] w-full cursor-grab overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-100 active:cursor-grabbing dark:from-slate-900 dark:to-slate-950 md:h-[76vh]" onWheel={onWheel} onMouseDown={() => setDragging(true)} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)} onMouseMove={(event) => dragging && setPan((prev) => ({ x: prev.x + event.movementX, y: prev.y + event.movementY }))}>
        <svg viewBox="0 0 700 960" className="h-full w-full transition-transform duration-200" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {projected.map((province) => (
            <ProvinceMarker key={province.slug} province={province} onSelect={onSelect} onHover={handleHover} onLeave={() => setHovered(null)} />
          ))}
        </svg>
      </div>

      {hovered && (
        <div className="pointer-events-none fixed z-50 rounded-lg border border-white/40 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl" style={{ left: hovered.x + 12, top: hovered.y + 12 }}>
          <p className="font-semibold">{hovered.name}</p>
          <p>PM2.5: {hovered.pm25.toFixed(1)}</p>
          <p>ระดับ: {levelThai(hovered.pm25).label}</p>
        </div>
      )}
    </motion.div>
  );
}
