"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo, useRef, useState, type MouseEvent, type WheelEventHandler } from "react";
import { levelThai } from "@/lib/formatThai";
import type { ProvinceSnapshot } from "@/types/air";

const MAP_WIDTH = 700;
const MAP_HEIGHT = 960;
const MAP_PADDING_X = 54;
const MAP_PADDING_Y = 36;

const THAILAND_CLIP_POLYGON: Point[] = [
  { x: 266, y: 28 },
  { x: 340, y: 34 },
  { x: 390, y: 92 },
  { x: 398, y: 143 },
  { x: 470, y: 146 },
  { x: 556, y: 204 },
  { x: 600, y: 286 },
  { x: 570, y: 365 },
  { x: 520, y: 418 },
  { x: 544, y: 495 },
  { x: 512, y: 584 },
  { x: 442, y: 630 },
  { x: 374, y: 638 },
  { x: 342, y: 700 },
  { x: 368, y: 782 },
  { x: 406, y: 850 },
  { x: 380, y: 928 },
  { x: 310, y: 950 },
  { x: 260, y: 908 },
  { x: 238, y: 820 },
  { x: 244, y: 744 },
  { x: 230, y: 688 },
  { x: 178, y: 642 },
  { x: 158, y: 560 },
  { x: 204, y: 512 },
  { x: 224, y: 462 },
  { x: 178, y: 396 },
  { x: 158, y: 306 },
  { x: 196, y: 228 },
  { x: 242, y: 184 },
  { x: 218, y: 116 },
  { x: 232, y: 62 },
];

const REGION_STYLES: Record<string, { th: string; fill: string; stroke: string; label: { x: number; y: number } }> = {
  North: { th: "ภาคเหนือ", fill: "#38bdf8", stroke: "#0ea5e9", label: { x: 282, y: 150 } },
  Northeast: { th: "ภาคอีสาน", fill: "#a78bfa", stroke: "#7c3aed", label: { x: 455, y: 286 } },
  Central: { th: "ภาคกลาง", fill: "#fbbf24", stroke: "#d97706", label: { x: 292, y: 452 } },
  East: { th: "ภาคตะวันออก", fill: "#34d399", stroke: "#059669", label: { x: 478, y: 532 } },
  West: { th: "ภาคตะวันตก", fill: "#fb7185", stroke: "#e11d48", label: { x: 210, y: 440 } },
  South: { th: "ภาคใต้", fill: "#2dd4bf", stroke: "#0f766e", label: { x: 318, y: 770 } },
};

const REGION_ORDER = ["North", "Northeast", "Central", "East", "West", "South"];

function pmLevel(pm25: number) {
  if (pm25 <= 25) return { fill: "#10b981", ring: "rgba(16,185,129,0.35)", label: "ดี" };
  if (pm25 <= 50) return { fill: "#facc15", ring: "rgba(250,204,21,0.35)", label: "ปานกลาง" };
  if (pm25 <= 75) return { fill: "#fb923c", ring: "rgba(251,146,60,0.35)", label: "เริ่มกระทบ" };
  if (pm25 <= 100) return { fill: "#f43f5e", ring: "rgba(244,63,94,0.38)", label: "ไม่ดี" };
  if (pm25 <= 150) return { fill: "#a855f7", ring: "rgba(168,85,247,0.4)", label: "อันตราย" };
  return { fill: "#111827", ring: "rgba(17,24,39,0.45)", label: "วิกฤต" };
}

type Point = { x: number; y: number };

type ThailandMapProps = {
  rows: ProvinceSnapshot[];
  search: string;
  selectedSlug: string | null;
  pmDeltaByProvince: Record<string, number>;
  onSelect: (slug: string) => void;
};

type HoveredState = { x: number; y: number; name: string; region: string; pm25: number; level: string } | null;

type ProvinceCell = ProvinceSnapshot & {
  points: Point[];
  pointString: string;
  center: Point;
  labelCenter: Point;
  active: boolean;
  delta: number;
  danger: boolean;
  rank: number;
};

function normalizeRegion(region: string) {
  return REGION_STYLES[region] ? region : "Central";
}

function projectProvince(province: ProvinceSnapshot, bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }) {
  const nx = (province.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1);
  const ny = (bounds.maxLat - province.latitude) / (bounds.maxLat - bounds.minLat || 1);
  const px = MAP_PADDING_X + nx * (MAP_WIDTH - MAP_PADDING_X * 2);
  const py = MAP_PADDING_Y + ny * (MAP_HEIGHT - MAP_PADDING_Y * 2);
  return { x: px, y: py };
}

function clipPolygonByHalfPlane(poly: Point[], site: Point, other: Point) {
  if (poly.length === 0) return poly;
  const mid = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 };
  const normal = { x: other.x - site.x, y: other.y - site.y };
  const inside = (point: Point) => (point.x - mid.x) * normal.x + (point.y - mid.y) * normal.y <= 0.000001;
  const intersect = (a: Point, b: Point) => {
    const da = (a.x - mid.x) * normal.x + (a.y - mid.y) * normal.y;
    const db = (b.x - mid.x) * normal.x + (b.y - mid.y) * normal.y;
    const t = da / (da - db || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  const output: Point[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const previous = poly[(i + poly.length - 1) % poly.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);

    if (currentInside) {
      if (!previousInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }
  }
  return output;
}

function centroid(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const a = current.x * next.y - next.x * current.y;
    signedArea += a;
    cx += (current.x + next.x) * a;
    cy += (current.y + next.y) * a;
  }

  if (Math.abs(signedArea) < 0.0001) {
    return points.reduce((acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }), { x: 0, y: 0 });
  }

  signedArea *= 0.5;
  return { x: cx / (6 * signedArea), y: cy / (6 * signedArea) };
}

function pathFromPoints(points: Point[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function ThailandMap({ rows, search, selectedSlug, pmDeltaByProvince, onSelect }: ThailandMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<HoveredState>(null);
  const hoverRaf = useRef<number | null>(null);

  const searchKey = search.trim().toLowerCase();

  const cells = useMemo(() => {
    if (!rows.length) return [] as ProvinceCell[];
    const bounds = {
      minLat: Math.min(...rows.map((province) => province.latitude)),
      maxLat: Math.max(...rows.map((province) => province.latitude)),
      minLon: Math.min(...rows.map((province) => province.longitude)),
      maxLon: Math.max(...rows.map((province) => province.longitude)),
    };
    const projected = rows.map((province) => ({ province, point: projectProvince(province, bounds) }));
    const rankedSlugs = new Map([...rows].sort((a, b) => b.air.pm25 - a.air.pm25).map((province, index) => [province.slug, index + 1]));

    return projected.map(({ province, point }) => {
      const polygon = projected.reduce((poly, other) => {
        if (other.province.slug === province.slug) return poly;
        return clipPolygonByHalfPlane(poly, point, other.point);
      }, THAILAND_CLIP_POLYGON.map((clipPoint) => ({ ...clipPoint })));
      const cellCenter = centroid(polygon);
      const labelCenter = polygon.length ? cellCenter : point;
      const active = province.slug === selectedSlug || (!!searchKey && `${province.province_name_th} ${province.province_name_en} ${REGION_STYLES[normalizeRegion(province.region)].th}`.toLowerCase().includes(searchKey));

      return {
        ...province,
        points: polygon,
        pointString: pathFromPoints(polygon),
        center: point,
        labelCenter,
        active,
        delta: pmDeltaByProvince[province.slug] ?? 0,
        danger: province.air.pm25 > 100,
        rank: rankedSlugs.get(province.slug) ?? 99,
      };
    }).filter((cell) => cell.points.length >= 3);
  }, [rows, selectedSlug, searchKey, pmDeltaByProvince]);

  const nationalAverage = useMemo(() => (rows.length ? rows.reduce((sum, row) => sum + row.air.pm25, 0) / rows.length : 0), [rows]);
  const topProvince = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25)[0], [rows]);
  const regionCounts = useMemo(() => REGION_ORDER.map((region) => ({ region, count: cells.filter((cell) => normalizeRegion(cell.region) === region).length })), [cells]);

  const onWheel: WheelEventHandler<HTMLDivElement> = useCallback((event) => {
    event.preventDefault();
    setZoom((prev) => Math.max(0.8, Math.min(2.8, prev + (event.deltaY > 0 ? -0.08 : 0.08))));
  }, []);

  const handleHover = useCallback((event: MouseEvent<SVGPolygonElement>, province: ProvinceCell) => {
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = requestAnimationFrame(() => {
      setHovered({
        x: event.clientX,
        y: event.clientY,
        name: province.province_name_th,
        region: REGION_STYLES[normalizeRegion(province.region)].th,
        pm25: province.air.pm25,
        level: levelThai(province.air.pm25).label,
      });
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[2rem] border border-white/45 bg-slate-950 p-2 shadow-2xl shadow-sky-950/25 dark:border-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.32),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(16,185,129,0.23),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.12),rgba(8,47,73,0.75))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />

      <div className="relative h-[60vh] w-full cursor-grab overflow-hidden rounded-[1.55rem] bg-gradient-to-br from-sky-950 via-cyan-950 to-slate-950 active:cursor-grabbing md:h-[78vh]" onWheel={onWheel} onMouseDown={() => setDragging(true)} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)} onMouseMove={(event) => dragging && setPan((prev) => ({ x: prev.x + event.movementX, y: prev.y + event.movementY }))}>
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white shadow-xl backdrop-blur-md">
          <p className="text-xs font-semibold text-cyan-200">Thailand Province Map</p>
          <p className="mt-1 text-2xl font-black">{nationalAverage.toFixed(1)} <span className="text-sm font-semibold text-slate-300">μg/m³</span></p>
          <p className="text-xs text-slate-300">77 จังหวัด · แบ่ง {REGION_ORDER.length} ภาค · สูงสุด {topProvince?.province_name_th ?? "-"}</p>
        </div>

        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-full w-full transition-transform duration-200" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="แผนที่ประเทศไทยแบ่งรายจังหวัดและรายภาค">
          <defs>
            <filter id="provinceShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#020617" floodOpacity="0.42" />
            </filter>
          </defs>

          <polygon points={pathFromPoints(THAILAND_CLIP_POLYGON)} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.72)" strokeWidth="5" strokeLinejoin="round" filter="url(#provinceShadow)" />

          {cells.map((province) => {
            const regionStyle = REGION_STYLES[normalizeRegion(province.region)];
            const pmStyle = pmLevel(province.air.pm25);
            const shouldShowName = province.active || province.rank <= 12 || province.danger;

            return (
              <g key={province.slug}>
                {province.danger && <circle cx={province.labelCenter.x} cy={province.labelCenter.y} r="22" fill={pmStyle.ring} className="animate-pulse" />}
                <polygon
                  points={province.pointString}
                  fill={pmStyle.fill}
                  fillOpacity={province.active ? 0.95 : 0.75}
                  stroke={province.active ? "#ffffff" : regionStyle.stroke}
                  strokeWidth={province.active ? 3.4 : 1.45}
                  strokeLinejoin="round"
                  className="cursor-pointer transition-all duration-200 hover:brightness-110"
                  style={{ filter: province.active ? "drop-shadow(0 0 18px rgba(255,255,255,0.65))" : undefined }}
                  onClick={() => onSelect(province.slug)}
                  onMouseEnter={(event) => handleHover(event, province)}
                  onMouseMove={(event) => handleHover(event, province)}
                  onMouseLeave={() => setHovered(null)}
                />
                <circle cx={province.labelCenter.x} cy={province.labelCenter.y} r={province.active ? 4.8 : 2.5} fill="#ffffff" opacity={province.active ? 0.95 : 0.65} />
                {shouldShowName && (
                  <text x={province.labelCenter.x} y={province.labelCenter.y - 7} textAnchor="middle" fontSize={province.active ? 12 : 9.4} fontWeight="900" fill="#ffffff" paintOrder="stroke" stroke="rgba(15,23,42,0.78)" strokeWidth="3">
                    {province.province_name_th}
                  </text>
                )}
                {Math.abs(province.delta) >= 1 && (
                  <text x={province.labelCenter.x + 10} y={province.labelCenter.y + 13} fontSize="10" fontWeight="900" fill={province.delta > 0 ? "#fecdd3" : "#bbf7d0"} paintOrder="stroke" stroke="rgba(15,23,42,0.75)" strokeWidth="2">
                    {province.delta > 0 ? `▲ +${province.delta.toFixed(0)}` : `▼ ${Math.abs(province.delta).toFixed(0)}`}
                  </text>
                )}
              </g>
            );
          })}

          {REGION_ORDER.map((region) => {
            const style = REGION_STYLES[region];
            return (
              <g key={region} className="pointer-events-none">
                <rect x={style.label.x - 42} y={style.label.y - 18} width="84" height="28" rx="14" fill="rgba(15,23,42,0.48)" stroke={style.stroke} strokeWidth="1.6" />
                <text x={style.label.x} y={style.label.y} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">
                  {style.th}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="absolute bottom-4 left-4 right-4 z-10 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-white shadow-xl backdrop-blur-md">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-2 font-bold">สีค่าฝุ่น PM2.5</p>
                <div className="flex flex-wrap gap-2">
                  {["ดี", "ปานกลาง", "เริ่มกระทบ", "ไม่ดี", "อันตราย"].map((label, index) => (
                    <span key={label} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ["#10b981", "#facc15", "#fb923c", "#f43f5e", "#a855f7"][index] }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 font-bold">เส้นขอบแบ่งภาค</p>
                <div className="flex flex-wrap gap-2">
                  {regionCounts.map(({ region, count }) => {
                    const style = REGION_STYLES[region];
                    return (
                      <span key={region} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.stroke }} />
                        {style.th.replace("ภาค", "")} {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setZoom((z) => Math.min(2.8, z + 0.15))} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-white/20">+</button>
            <button onClick={() => setZoom((z) => Math.max(0.8, z - 0.15))} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur transition hover:bg-white/20">−</button>
          </div>
        </div>
      </div>

      {hovered && (
        <div className="pointer-events-none fixed z-50 rounded-2xl border border-white/20 bg-slate-950/92 px-4 py-3 text-xs text-white shadow-2xl backdrop-blur-md" style={{ left: hovered.x + 12, top: hovered.y + 12 }}>
          <p className="font-bold">{hovered.name}</p>
          <p className="mt-1 text-cyan-100">{hovered.region}</p>
          <p className="mt-1">PM2.5: {hovered.pm25.toFixed(1)} μg/m³</p>
          <p>ระดับ: {hovered.level}</p>
        </div>
      )}
    </motion.div>
  );
}
