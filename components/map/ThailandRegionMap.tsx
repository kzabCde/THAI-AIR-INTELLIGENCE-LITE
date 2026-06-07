"use client";

import { motion } from "framer-motion";
import { memo, useCallback, useMemo, useState, type MouseEvent } from "react";
import { MapPin, Maximize2, Minus, Plus } from "lucide-react";
import { getAqiCategory, REGION_COLORS, THAI_REGION_ORDER, type ThaiRegionName } from "@/lib/map/region-colors";
import type { DisplayMode, MapProvince } from "@/lib/map/province-region";
import { ProvinceTooltip } from "@/components/map/ProvinceTooltip";
import { RegionLegend } from "@/components/map/RegionLegend";

type ThailandRegionMapProps = {
  provinces: MapProvince[];
  visibleProvinceSlugs: Set<string>;
  selectedSlug: string | null;
  displayMode: DisplayMode;
  onSelect: (slug: string) => void;
};

type ProjectedProvince = MapProvince & {
  px: number;
  py: number;
  active: boolean;
  muted: boolean;
  color: string;
};

type HoverState = { province: MapProvince; x: number; y: number } | null;

const REGION_LABEL_ANCHORS: Record<TopLevelRegionLabel, { x: number; y: number; align?: "left" | "center" | "right" }> = {
  ภาคเหนือ: { x: 250, y: 180 },
  ภาคตะวันออกเฉียงเหนือ: { x: 490, y: 310 },
  ภาคกลาง: { x: 310, y: 415 },
  ภาคตะวันออก: { x: 485, y: 510 },
  ภาคตะวันตก: { x: 205, y: 490 },
  ภาคใต้: { x: 350, y: 780 },
  กรุงเทพมหานครและปริมณฑล: { x: 345, y: 505 },
};

type TopLevelRegionLabel = ThaiRegionName;

function projectProvince(rows: MapProvince[]) {
  const lats = rows.map((province) => province.latitude);
  const lons = rows.map((province) => province.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  return (province: MapProvince) => ({
    px: ((province.longitude - minLon) / (maxLon - minLon)) * 520 + 100,
    py: ((maxLat - province.latitude) / (maxLat - minLat)) * 790 + 75,
  });
}

function makeMarkerPath(x: number, y: number, size: number) {
  return `${x},${y - size} ${x + size * 0.86},${y - size / 2} ${x + size * 0.86},${y + size / 2} ${x},${y + size} ${x - size * 0.86},${y + size / 2} ${x - size * 0.86},${y - size / 2}`;
}

const ProvinceMarker = memo(function ProvinceMarker({ province, onSelect, onHover, onLeave }: {
  province: ProjectedProvince;
  onSelect: (slug: string) => void;
  onHover: (event: MouseEvent<SVGPathElement>, province: ProjectedProvince) => void;
  onLeave: () => void;
}) {
  const size = province.active ? 12 : 8.5;
  return (
    <g opacity={province.muted ? 0.2 : 1} className="transition-opacity duration-200">
      {province.mockAqi >= 120 && <circle cx={province.px} cy={province.py} r={size + 9} fill="#ef444433" className="animate-pulse" />}
      <path
        d={`M ${makeMarkerPath(province.px, province.py, size)} Z`}
        fill={province.color}
        stroke={province.active ? "#ffffff" : "rgba(15, 23, 42, 0.72)"}
        strokeWidth={province.active ? 2.5 : 1.2}
        className="cursor-pointer transition-all duration-200 hover:brightness-125"
        style={{ filter: province.active ? "drop-shadow(0 0 14px rgba(34,211,238,0.8))" : "drop-shadow(0 3px 5px rgba(0,0,0,0.25))" }}
        onClick={() => onSelect(province.slug)}
        onMouseEnter={(event) => onHover(event, province)}
        onMouseMove={(event) => onHover(event, province)}
        onMouseLeave={onLeave}
      />
      {province.active && (
        <text x={province.px + 13} y={province.py + 4} className="pointer-events-none select-none fill-white text-[11px] font-bold drop-shadow">
          {province.province_name_th}
        </text>
      )}
    </g>
  );
});

export function ThailandRegionMap({ provinces, visibleProvinceSlugs, selectedSlug, displayMode, onSelect }: ThailandRegionMapProps) {
  const [hovered, setHovered] = useState<HoverState>(null);
  const [zoom, setZoom] = useState(1);

  const projected = useMemo(() => {
    if (!provinces.length) return [] as ProjectedProvince[];
    const project = projectProvince(provinces);

    return provinces.map((province) => {
      const { px, py } = project(province);
      const color = displayMode === "aqi" ? getAqiCategory(province.mockAqi).color : REGION_COLORS[province.normalizedRegion].base;
      return {
        ...province,
        px,
        py,
        color,
        active: province.slug === selectedSlug,
        muted: !visibleProvinceSlugs.has(province.slug),
      };
    });
  }, [displayMode, provinces, selectedSlug, visibleProvinceSlugs]);

  const regionAreas = useMemo(() => {
    return THAI_REGION_ORDER.map((region) => {
      const items = projected.filter((province) => province.normalizedRegion === region);
      if (!items.length) return null;
      const minX = Math.min(...items.map((province) => province.px));
      const maxX = Math.max(...items.map((province) => province.px));
      const minY = Math.min(...items.map((province) => province.py));
      const maxY = Math.max(...items.map((province) => province.py));
      return {
        region,
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        rx: Math.max(44, (maxX - minX) / 2 + 34),
        ry: Math.max(42, (maxY - minY) / 2 + 30),
      };
    }).filter(Boolean) as Array<{ region: ThaiRegionName; x: number; y: number; rx: number; ry: number }>;
  }, [projected]);

  const handleHover = useCallback((event: MouseEvent<SVGPathElement>, province: ProjectedProvince) => {
    setHovered({ province, x: event.clientX, y: event.clientY });
  }, []);

  if (!provinces.length) {
    return (
      <div className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-6 text-sm text-rose-100">
        ไม่สามารถโหลดข้อมูลแผนที่ได้ แต่ยังสามารถดูรายการจังหวัดได้
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl"
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_18%_12%,rgba(250,204,21,0.16),transparent_28%),radial-gradient(circle_at_78%_24%,rgba(251,146,60,0.18),transparent_28%),radial-gradient(circle_at_55%_58%,rgba(20,184,166,0.16),transparent_25%),radial-gradient(circle_at_48%_90%,rgba(6,182,212,0.16),transparent_28%)]" />

      <div className="relative grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative min-h-[560px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_65%)] sm:min-h-[680px]">
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur">
            <MapPin className="h-4 w-4 text-cyan-200" />
            แผนภาพตำแหน่งจังหวัดตามพิกัดจริง · Placeholder SVG
          </div>

          <svg viewBox="0 0 700 960" className="h-full min-h-[560px] w-full sm:min-h-[680px]" style={{ transform: `scale(${zoom})`, transformOrigin: "50% 45%" }} role="img" aria-label="แผนที่ภูมิภาคและจังหวัดของประเทศไทยแบบ SVG placeholder">
            <defs>
              <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="9" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {regionAreas.map((area) => {
              const color = REGION_COLORS[area.region];
              return (
                <ellipse
                  key={area.region}
                  cx={area.x}
                  cy={area.y}
                  rx={area.rx}
                  ry={area.ry}
                  fill={color.soft}
                  stroke={displayMode === "aqi" ? color.border : "rgba(255,255,255,0.16)"}
                  strokeWidth={displayMode === "aqi" ? 1.5 : 1}
                  filter="url(#softGlow)"
                />
              );
            })}

            <path d="M238 72 C182 116 155 211 195 277 C222 322 199 386 171 448 C129 542 164 630 221 665 C286 704 281 756 254 817 C243 852 250 898 286 925" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="18" strokeLinecap="round" />
            <path d="M363 289 C436 236 563 252 614 330 C651 388 623 475 539 514 C457 552 380 534 338 488" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="18" strokeLinecap="round" />

            {projected.map((province) => (
              <ProvinceMarker key={province.slug} province={province} onSelect={onSelect} onHover={handleHover} onLeave={() => setHovered(null)} />
            ))}

            {THAI_REGION_ORDER.map((region) => {
              const color = REGION_COLORS[region];
              const anchor = REGION_LABEL_ANCHORS[region];
              return (
                <g key={region} className="hidden sm:block">
                  <rect x={anchor.x - (region.length > 12 ? 98 : 58)} y={anchor.y - 20} width={region.length > 12 ? 196 : 116} height="40" rx="20" fill={color.base} opacity="0.22" stroke={color.border} />
                  <text x={anchor.x} y={anchor.y + 6} textAnchor="middle" className="pointer-events-none select-none fill-white text-[16px] font-black drop-shadow">
                    {region}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="absolute bottom-4 right-4 z-10 flex gap-2">
            <button type="button" onClick={() => setZoom((value) => Math.min(1.45, value + 0.08))} className="rounded-xl border border-white/10 bg-slate-950/70 p-2 text-white backdrop-blur transition hover:bg-white/10" aria-label="ขยายแผนที่"><Plus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.88, value - 0.08))} className="rounded-xl border border-white/10 bg-slate-950/70 p-2 text-white backdrop-blur transition hover:bg-white/10" aria-label="ย่อแผนที่"><Minus className="h-4 w-4" /></button>
            <button type="button" onClick={() => setZoom(1)} className="rounded-xl border border-white/10 bg-slate-950/70 p-2 text-white backdrop-blur transition hover:bg-white/10" aria-label="รีเซ็ตแผนที่"><Maximize2 className="h-4 w-4" /></button>
          </div>
        </div>

        <RegionLegend mode={displayMode} />
      </div>

      {hovered && <ProvinceTooltip province={hovered.province} x={hovered.x} y={hovered.y} />}
    </motion.div>
  );
}
