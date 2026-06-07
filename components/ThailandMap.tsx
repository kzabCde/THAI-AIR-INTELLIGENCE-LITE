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

const REGION_STYLES: Record<string, { th: string; short: string; fill: string; stroke: string; labelBg: string; label: { x: number; y: number } }> = {
  North: { th: "ภาคเหนือ", short: "เหนือ", fill: "#ffd21f", stroke: "#b98500", labelBg: "#fff04a", label: { x: 300, y: 205 } },
  Northeast: { th: "ภาคตะวันออกเฉียงเหนือ", short: "อีสาน", fill: "#ff8a1f", stroke: "#b95000", labelBg: "#ffc56d", label: { x: 470, y: 350 } },
  Central: { th: "ภาคกลาง", short: "กลาง", fill: "#78c91f", stroke: "#3f8a12", labelBg: "#cff3c5", label: { x: 302, y: 496 } },
  East: { th: "ภาคตะวันออก", short: "ตะวันออก", fill: "#ff6f74", stroke: "#bf2f43", labelBg: "#ffd1df", label: { x: 490, y: 573 } },
  West: { th: "ภาคตะวันตก", short: "ตะวันตก", fill: "#9b65c8", stroke: "#5b2f92", labelBg: "#eac0f0", label: { x: 190, y: 520 } },
  South: { th: "ภาคใต้", short: "ใต้", fill: "#1488d3", stroke: "#075a9d", labelBg: "#bff2ff", label: { x: 334, y: 805 } },
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

      <div className="relative h-[62vh] w-full cursor-grab overflow-hidden rounded-[1.55rem] bg-white active:cursor-grabbing dark:bg-slate-950 md:h-[82vh]" onWheel={onWheel} onMouseDown={() => setDragging(true)} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)} onMouseMove={(event) => dragging && setPan((prev) => ({ x: prev.x + event.movementX, y: prev.y + event.movementY }))}>
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-slate-950 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-950/85 dark:text-white">
          <p className="text-xs font-semibold text-sky-600 dark:text-cyan-200">Thailand Province Map</p>
          <p className="mt-1 text-2xl font-black">{nationalAverage.toFixed(1)} <span className="text-sm font-semibold text-slate-500 dark:text-slate-300">μg/m³</span></p>
          <p className="text-xs text-slate-500 dark:text-slate-300">77 จังหวัด · สีตามภาค · สูงสุด {topProvince?.province_name_th ?? "-"}</p>
        </div>

        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-full w-full transition-transform duration-200" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="แผนที่ประเทศไทยแบ่งรายจังหวัดและรายภาค">
          <defs>
            <filter id="provinceShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#020617" floodOpacity="0.42" />
            </filter>
          </defs>

          <polygon points={pathFromPoints(THAILAND_CLIP_POLYGON)} fill="rgba(255,255,255,0.04)" stroke="rgba(15,23,42,0.88)" strokeWidth="5" strokeLinejoin="round" filter="url(#provinceShadow)" />

          {cells.map((province) => {
            const regionStyle = REGION_STYLES[normalizeRegion(province.region)];
            const pmStyle = pmLevel(province.air.pm25);
            const labelFontSize = province.province_name_th.length > 12 ? 7.2 : province.province_name_th.length > 9 ? 8 : 8.8;

            return (
              <g key={province.slug}>
                {province.danger && <circle cx={province.labelCenter.x} cy={province.labelCenter.y} r="22" fill={pmStyle.ring} className="animate-pulse" />}
                <polygon
                  points={province.pointString}
                  fill={regionStyle.fill}
                  fillOpacity={province.active ? 0.98 : 0.9}
                  stroke={province.active ? "#111827" : "rgba(255,255,255,0.92)"}
                  strokeWidth={province.active ? 3.2 : 1.25}
                  strokeLinejoin="round"
                  className="cursor-pointer transition-all duration-200 hover:brightness-110"
                  style={{ filter: province.active ? "drop-shadow(0 0 18px rgba(255,255,255,0.65))" : undefined }}
                  onClick={() => onSelect(province.slug)}
                  onMouseEnter={(event) => handleHover(event, province)}
                  onMouseMove={(event) => handleHover(event, province)}
                  onMouseLeave={() => setHovered(null)}
                />
                <text x={province.labelCenter.x} y={province.labelCenter.y - 2} textAnchor="middle" fontSize={province.active ? 11.5 : labelFontSize} fontWeight={province.active ? "900" : "700"} fill="#111827" paintOrder="stroke" stroke="rgba(255,255,255,0.75)" strokeWidth="2.2">
                  {province.province_name_th}
                </text>
                <circle cx={province.labelCenter.x} cy={province.labelCenter.y + 8} r={province.active ? 5.2 : province.danger ? 4.7 : 3.6} fill={pmStyle.fill} stroke="#ffffff" strokeWidth="1.5" opacity="0.96" />
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
                <rect x={style.label.x - (region === "Northeast" ? 92 : 48)} y={style.label.y - 26} width={region === "Northeast" ? 184 : 96} height="42" rx="14" fill={style.labelBg} stroke="rgba(255,255,255,0.72)" strokeWidth="2" opacity="0.94" />
                <text x={style.label.x} y={style.label.y} textAnchor="middle" fill="#111827" fontSize={region === "Northeast" ? 17 : 20} fontWeight="950" paintOrder="stroke" stroke="rgba(255,255,255,0.35)" strokeWidth="1">
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
                <p className="mb-2 font-bold">สีพื้นแบ่งตามภาค</p>
                <div className="flex flex-wrap gap-2">
                  {regionCounts.map(({ region, count }) => {
                    const style = REGION_STYLES[region];
                    return (
                      <span key={region} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.fill }} />
                        {style.short} {count}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 font-bold">จุดสีแสดง PM2.5</p>
                <div className="flex flex-wrap gap-2">
                  {["ดี", "ปานกลาง", "เริ่มกระทบ", "ไม่ดี", "อันตราย"].map((label, index) => (
                    <span key={label} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ["#10b981", "#facc15", "#fb923c", "#f43f5e", "#a855f7"][index] }} />
                      {label}
                    </span>
                  ))}
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
