"use client";

import { motion } from "framer-motion";
import { memo, useCallback, useMemo, useRef, useState, type MouseEvent, type WheelEventHandler } from "react";
import { levelThai } from "@/lib/formatThai";
import type { ProvinceSnapshot } from "@/types/air";

const THAILAND_OUTLINE =
  "M292 32 C345 28 386 61 392 111 C459 115 520 150 551 205 C588 270 569 346 514 389 C482 414 474 447 506 482 C540 519 533 573 489 603 C441 636 395 626 360 658 C324 692 335 748 369 794 C398 833 400 888 364 920 C329 951 281 943 257 901 C232 857 232 799 245 748 C256 707 248 677 216 652 C174 619 175 560 215 527 C242 505 245 475 225 448 C190 400 172 356 177 307 C182 252 215 215 251 181 C220 145 213 97 238 62 C251 43 269 34 292 32 Z";

const REGION_LABELS = [
  { label: "เหนือ", x: 285, y: 150 },
  { label: "อีสาน", x: 440, y: 275 },
  { label: "กลาง", x: 306, y: 455 },
  { label: "ตะวันออก", x: 450, y: 520 },
  { label: "ใต้", x: 312, y: 765 },
];

function pmLevel(pm25: number) {
  if (pm25 <= 25) return { fill: "#10b981", glow: "rgba(16,185,129,0.35)", label: "ดี" };
  if (pm25 <= 50) return { fill: "#facc15", glow: "rgba(250,204,21,0.35)", label: "ปานกลาง" };
  if (pm25 <= 75) return { fill: "#fb923c", glow: "rgba(251,146,60,0.35)", label: "เริ่มกระทบ" };
  if (pm25 <= 100) return { fill: "#f43f5e", glow: "rgba(244,63,94,0.38)", label: "ไม่ดี" };
  if (pm25 <= 150) return { fill: "#a855f7", glow: "rgba(168,85,247,0.4)", label: "อันตราย" };
  return { fill: "#111827", glow: "rgba(17,24,39,0.45)", label: "วิกฤต" };
}

type ThailandMapProps = {
  rows: ProvinceSnapshot[];
  search: string;
  selectedSlug: string | null;
  pmDeltaByProvince: Record<string, number>;
  onSelect: (slug: string) => void;
};

type HoveredState = { x: number; y: number; name: string; pm25: number; level: string } | null;

type ProjectedProvince = ProvinceSnapshot & {
  px: number;
  py: number;
  active: boolean;
  delta: number;
  danger: boolean;
  rank: number;
};

const ProvinceNode = memo(function ProvinceNode({
  province,
  onSelect,
  onHover,
  onLeave,
}: {
  province: ProjectedProvince;
  onSelect: (slug: string) => void;
  onHover: (event: MouseEvent<SVGGElement>, province: ProjectedProvince) => void;
  onLeave: () => void;
}) {
  const level = pmLevel(province.air.pm25);
  const radius = province.active ? 12 : province.danger ? 9 : 7;
  const showLabel = province.active || province.rank <= 6 || province.danger;

  return (
    <g className="cursor-pointer" onClick={() => onSelect(province.slug)} onMouseEnter={(event) => onHover(event, province)} onMouseMove={(event) => onHover(event, province)} onMouseLeave={onLeave}>
      {province.danger && <circle cx={province.px} cy={province.py} r={radius + 13} fill={level.glow} className="animate-pulse" />}
      <circle cx={province.px} cy={province.py} r={radius + 5} fill={level.glow} opacity={province.active ? 0.9 : 0.55} />
      <circle cx={province.px} cy={province.py} r={radius} fill={level.fill} stroke={province.active ? "#ffffff" : "rgba(255,255,255,0.78)"} strokeWidth={province.active ? 3 : 1.5} className="transition-all duration-200 hover:brightness-110" style={{ filter: province.active ? "drop-shadow(0 0 16px rgba(14,165,233,0.95))" : "drop-shadow(0 6px 10px rgba(15,23,42,0.2))" }} />
      {showLabel && (
        <g>
          <rect x={province.px + 11} y={province.py - 15} width={Math.min(102, province.province_name_th.length * 9 + 26)} height="24" rx="12" fill="rgba(15,23,42,0.76)" stroke="rgba(255,255,255,0.18)" />
          <text x={province.px + 23} y={province.py + 1} fontSize="12" fontWeight="700" fill="#fff">
            {province.province_name_th}
          </text>
        </g>
      )}
      {Math.abs(province.delta) >= 1 && (
        <text x={province.px + 12} y={province.py - 18} fontSize="10" fontWeight="800" fill={province.delta > 0 ? "#e11d48" : "#059669"}>
          {province.delta > 0 ? `▲ +${province.delta.toFixed(0)}` : `▼ ${Math.abs(province.delta).toFixed(0)}`}
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
    const rankedSlugs = new Map([...rows].sort((a, b) => b.air.pm25 - a.air.pm25).map((x, index) => [x.slug, index + 1]));

    return rows.map((province) => {
      const nx = (province.longitude - minLon) / (maxLon - minLon || 1);
      const ny = (maxLat - province.latitude) / (maxLat - minLat || 1);
      const peninsulaPull = province.latitude < 11 ? -95 + (11 - province.latitude) * 18 : 0;
      const northeastPull = province.longitude > 101 && province.latitude > 14 ? 36 : 0;
      const centralCurve = province.latitude < 15 && province.latitude >= 11 ? -18 : 0;
      const px = 154 + nx * 398 + peninsulaPull + northeastPull + centralCurve;
      const py = 58 + ny * 855;
      const active = province.slug === selectedSlug || (!!searchKey && `${province.province_name_th} ${province.province_name_en}`.toLowerCase().includes(searchKey));

      return {
        ...province,
        px,
        py,
        active,
        delta: pmDeltaByProvince[province.slug] ?? 0,
        danger: province.air.pm25 > 100,
        rank: rankedSlugs.get(province.slug) ?? 99,
      };
    });
  }, [rows, selectedSlug, searchKey, pmDeltaByProvince]);

  const nationalAverage = useMemo(() => (rows.length ? rows.reduce((sum, row) => sum + row.air.pm25, 0) / rows.length : 0), [rows]);
  const topProvince = useMemo(() => [...rows].sort((a, b) => b.air.pm25 - a.air.pm25)[0], [rows]);

  const onWheel: WheelEventHandler<HTMLDivElement> = useCallback((event) => {
    event.preventDefault();
    setZoom((prev) => Math.max(0.8, Math.min(2.8, prev + (event.deltaY > 0 ? -0.08 : 0.08))));
  }, []);

  const handleHover = useCallback((event: MouseEvent<SVGGElement>, province: ProjectedProvince) => {
    if (hoverRaf.current) cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = requestAnimationFrame(() => {
      setHovered({
        x: event.clientX,
        y: event.clientY,
        name: province.province_name_th,
        pm25: province.air.pm25,
        level: levelThai(province.air.pm25).label,
      });
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[2rem] border border-white/45 bg-slate-950 p-2 shadow-2xl shadow-sky-950/25 dark:border-white/10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.32),transparent_34%),radial-gradient(circle_at_78%_10%,rgba(16,185,129,0.23),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.12),rgba(8,47,73,0.75))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />

      <div className="relative h-[58vh] w-full cursor-grab overflow-hidden rounded-[1.55rem] bg-gradient-to-br from-sky-950 via-cyan-950 to-slate-950 active:cursor-grabbing md:h-[76vh]" onWheel={onWheel} onMouseDown={() => setDragging(true)} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)} onMouseMove={(event) => dragging && setPan((prev) => ({ x: prev.x + event.movementX, y: prev.y + event.movementY }))}>
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white shadow-xl backdrop-blur-md">
          <p className="text-xs font-semibold text-cyan-200">Thailand Air Atlas</p>
          <p className="mt-1 text-2xl font-black">{nationalAverage.toFixed(1)} <span className="text-sm font-semibold text-slate-300">μg/m³</span></p>
          <p className="text-xs text-slate-300">เฉลี่ยประเทศ · จุดสูงสุด {topProvince?.province_name_th ?? "-"}</p>
        </div>

        <svg viewBox="0 0 700 960" className="h-full w-full transition-transform duration-200" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="แผนที่คุณภาพอากาศประเทศไทย">
          <defs>
            <linearGradient id="thaiLandGradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#99f6e4" stopOpacity="0.72" />
              <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.86" />
            </linearGradient>
            <filter id="softMapShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="24" stdDeviation="24" floodColor="#020617" floodOpacity="0.42" />
            </filter>
          </defs>

          <path d="M95 222 C190 182 243 204 281 259 C316 311 384 316 476 285 C548 261 617 288 646 354" fill="none" stroke="rgba(125,211,252,0.23)" strokeWidth="22" strokeLinecap="round" />
          <path d="M99 696 C186 641 248 650 292 711 C334 768 411 759 511 715" fill="none" stroke="rgba(45,212,191,0.16)" strokeWidth="18" strokeLinecap="round" />

          <path d={THAILAND_OUTLINE} fill="url(#thaiLandGradient)" opacity="0.2" filter="url(#softMapShadow)" />
          <path d={THAILAND_OUTLINE} fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="3" strokeLinejoin="round" />
          <path d="M250 181 C310 232 389 234 514 205" fill="none" stroke="rgba(14,165,233,0.24)" strokeWidth="2" strokeDasharray="8 10" />
          <path d="M215 527 C291 567 382 565 506 482" fill="none" stroke="rgba(14,165,233,0.20)" strokeWidth="2" strokeDasharray="8 10" />

          {REGION_LABELS.map((region) => (
            <text key={region.label} x={region.x} y={region.y} fill="rgba(255,255,255,0.32)" fontSize="28" fontWeight="900" textAnchor="middle">
              {region.label}
            </text>
          ))}

          {projected.map((province) => (
            <ProvinceNode key={province.slug} province={province} onSelect={onSelect} onHover={handleHover} onLeave={() => setHovered(null)} />
          ))}
        </svg>

        <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-end justify-between gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-white shadow-xl backdrop-blur-md">
            <p className="mb-2 font-bold">ระดับสี PM2.5</p>
            <div className="flex flex-wrap gap-2">
              {["ดี", "ปานกลาง", "เริ่มกระทบ", "ไม่ดี", "อันตราย"].map((label, index) => (
                <span key={label} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ["#10b981", "#facc15", "#fb923c", "#f43f5e", "#a855f7"][index] }} />
                  {label}
                </span>
              ))}
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
          <p className="mt-1">PM2.5: {hovered.pm25.toFixed(1)} μg/m³</p>
          <p>ระดับ: {hovered.level}</p>
        </div>
      )}
    </motion.div>
  );
}
